#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You can obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
from __future__ import annotations

import logging
import os
import re
import zipfile
from abc import ABC
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Optional

from agent.tools.base import ToolBase, ToolMeta, ToolParamBase
from common.connection_utils import timeout
from common.data_source.seafile_client import SeafileClient
from common.data_source.seafile_week import (
    file_in_week,
    normalise_path,
    parse_mtime,
    path_in_scope,
    resolve_week,
    search_roots_for_libraries,
)

logger = logging.getLogger(__name__)

DEFAULT_FILENAME_REGEX = r"(?:(?P<author>[^/\\]+)-)?(?P<date>\d{4}[-./]\d{1,2}[-./]\d{1,2}).*\.(md|docx|txt)$"
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_TEXT_CHARS = 20_000
TEXT_EXTS = {".md", ".txt", ".markdown"}
DOCX_EXTS = {".docx"}


class SeafileParam(ToolParamBase):
    def __init__(self):
        self.meta: ToolMeta = {
            "name": "seafile_browse",
            "description": "List and download daily-report files from a configured SeaFile data source. Use search to collect this week's reports.",
            "parameters": {
                "action": {
                    "type": "string",
                    "description": "search (default), list_dir, or download.",
                    "default": "search",
                    "enum": ["search", "list_dir", "download"],
                    "required": False,
                },
                "path": {
                    "type": "string",
                    "description": "Directory or file path inside the library.",
                    "default": "",
                    "required": False,
                },
                "repo_id": {
                    "type": "string",
                    "description": "Library id. Ignored for directory/library-scoped connectors.",
                    "default": "",
                    "required": False,
                },
            },
        }
        super().__init__()
        self.connector_id = ""
        self.default_repo_id = ""
        self.filename_regex = DEFAULT_FILENAME_REGEX
        self.week_mode = "this_week"
        self.timezone = "Asia/Shanghai"
        self.expected_authors: list[str] = []
        self.require_complete = False
        self.allow_list_libraries = False
        self.download_hosts: list[str] = []
        self.max_files = 80

    def check(self):
        if self.max_files is not None:
            self.check_positive_integer(self.max_files, "Max files")

    def get_input_form(self) -> dict[str, dict]:
        return {
            "action": {"name": "Action", "type": "options", "options": ["search", "list_dir", "download"]},
            "path": {"name": "Path", "type": "line", "optional": True},
        }


def _extract_docx_text(blob: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(blob)) as archive:
            xml = archive.read("word/document.xml")
    except Exception:
        return ""
    text = re.sub(rb"</w:p>", b"\n", xml)
    text = re.sub(rb"<[^>]+>", b"", text)
    return text.decode("utf-8", errors="ignore")


def _decode_file(name: str, blob: bytes) -> tuple[str, str]:
    ext = os.path.splitext(name)[1].lower()
    if ext in TEXT_EXTS:
        return blob.decode("utf-8", errors="replace")[:MAX_TEXT_CHARS], ""
    if ext in DOCX_EXTS:
        return _extract_docx_text(blob)[:MAX_TEXT_CHARS], ""
    return "", f"skipped_{ext.lstrip('.') or 'unknown'}"


class Seafile(ToolBase, ABC):
    component_name = "Seafile"

    def _connector_row(self):
        from api.db.services.connector_service import ConnectorService

        connector_id = (self._param.connector_id or "").strip()
        if not connector_id:
            raise ValueError("Seafile connector_id is required on the node.")
        tenant_id = self._canvas.get_tenant_id()
        if not ConnectorService.accessible(connector_id, tenant_id):
            raise PermissionError("Seafile connector is not accessible to this canvas owner.")
        ok, connector = ConnectorService.get_by_id(connector_id)
        if not ok:
            raise ValueError(f"Seafile connector {connector_id} was not found.")
        source = (getattr(connector, "source", "") or "").lower()
        if source != "seafile":
            raise ValueError(f"Connector {connector_id} is source={source!r}, expected seafile.")
        return connector

    def _client_and_scope(self, connector) -> tuple[SeafileClient, dict[str, Any]]:
        config = connector.config or {}
        credentials = config.get("credentials") or {}
        token = credentials.get("seafile_token") or config.get("seafile_token")
        repo_token = credentials.get("repo_token") or config.get("repo_token")
        seafile_url = config.get("seafile_url") or ""
        extra_hosts = list(self._param.download_hosts or config.get("download_hosts") or [])
        client = SeafileClient(
            seafile_url,
            token=token,
            repo_token=repo_token,
            download_hosts=extra_hosts,
        )
        scope = {
            "sync_scope": (config.get("sync_scope") or "account").lower(),
            "repo_id": config.get("repo_id") or "",
            "sync_path": normalise_path(config.get("sync_path")),
        }
        return client, scope

    def _requested_path(self, scope: dict[str, Any], kwargs: dict[str, Any]) -> str:
        requested_path = kwargs.get("path")
        if requested_path in (None, ""):
            requested_path = self._param.path or scope["sync_path"]
        return normalise_path(str(requested_path or "/"))

    def _resolve_repo_and_path(
        self,
        scope: dict[str, Any],
        kwargs: dict[str, Any],
        client: SeafileClient | None = None,
    ) -> tuple[str, str]:
        requested_repo = (kwargs.get("repo_id") or "").strip()
        requested_path = self._requested_path(scope, kwargs)

        if scope["sync_scope"] in ("library", "directory"):
            repo_id = scope["repo_id"]
            if requested_repo and requested_repo != repo_id:
                raise PermissionError("资料库 ID 已由数据源锁定，不能改到其他库。")
            if scope["sync_scope"] == "directory" and not path_in_scope(requested_path, scope["sync_path"]):
                raise PermissionError(f"路径 {requested_path!r} 超出数据源同步目录 {scope['sync_path']!r}。")
            return repo_id, requested_path

        repo_id = requested_repo or (self._param.default_repo_id or "").strip() or scope["repo_id"]
        if not repo_id and client is not None:
            libraries = client.list_libraries()
            repo_id = next((lib.get("id") for lib in libraries if lib.get("id")), "")
        if not repo_id:
            raise ValueError("当前 Seafile 账号下没有可访问的资料库。")
        return repo_id, requested_path

    def _resolve_search_targets(self, client: SeafileClient, scope: dict[str, Any], kwargs: dict[str, Any]) -> list[tuple[str, str]]:
        requested_repo = (kwargs.get("repo_id") or "").strip()
        requested_path = self._requested_path(scope, kwargs)
        if scope["sync_scope"] in ("library", "directory"):
            repo_id, path = self._resolve_repo_and_path(scope, kwargs)
            return [(repo_id, path)]
        repo_id = requested_repo or (self._param.default_repo_id or "").strip() or scope["repo_id"]
        if repo_id:
            name = requested_path.strip("/")
            if name:
                try:
                    info = client.get_repo_info(repo_id) or {}
                except Exception:
                    info = {}
                if (info.get("name") or "").strip() == name:
                    return [(repo_id, "/")]
            return [(repo_id, requested_path)]
        libraries = client.list_libraries()
        targets = search_roots_for_libraries(libraries, requested_path)
        if not targets:
            raise ValueError("当前 Seafile 账号下没有可访问的资料库。")
        return targets

    def _match_file(self, path: str, name: str) -> dict[str, str]:
        pattern = self._param.filename_regex or DEFAULT_FILENAME_REGEX
        match = re.search(pattern, path) or re.search(pattern, name)
        groups = match.groupdict() if match else {}
        author = (groups.get("author") or "").strip()
        if not author:
            parts = [part for part in normalise_path(path).strip("/").split("/") if part]
            author = parts[-2] if len(parts) >= 2 else "unknown"
        return {
            "author": author or "unknown",
            "date": (groups.get("date") or "").strip(),
        }

    def _walk_files(self, client: SeafileClient, repo_id: str, root: str, window) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []

        def walk(path: str) -> None:
            if len(found) >= int(self._param.max_files):
                return
            try:
                entries = client.list_dir(repo_id, path)
            except Exception as exc:
                logger.warning("Seafile list_dir failed path=%s err=%s", path, exc)
                return
            for entry in entries:
                if len(found) >= int(self._param.max_files):
                    return
                entry_name = entry.get("name") or ""
                entry_path = f"{path.rstrip('/')}/{entry_name}"
                entry_type = entry.get("type")
                if entry_type == "dir":
                    walk(entry_path)
                    continue
                if entry_type != "file":
                    continue
                meta = self._match_file(entry_path, entry_name)
                if not file_in_week(window, meta.get("date") or "", entry.get("mtime")):
                    continue
                modified = parse_mtime(entry.get("mtime"))
                found.append(
                    {
                        "path": entry_path,
                        "name": entry_name,
                        "size": entry.get("size") or 0,
                        "mtime": modified.isoformat(),
                        "id": entry.get("id") or "",
                        "author": meta["author"],
                        "report_date": meta["date"],
                    }
                )

        walk(root)
        return found

    def _download_text(self, client: SeafileClient, repo_id: str, item: dict[str, Any]) -> None:
        size = int(item.get("size") or 0)
        if size > MAX_FILE_BYTES:
            item["content"] = ""
            item["skip_reason"] = "too_large"
            return
        try:
            link = client.get_download_link(repo_id, item["path"])
            if not link:
                item["content"] = ""
                item["skip_reason"] = "no_download_link"
                return
            blob = client.download(link)
        except Exception as exc:
            item["content"] = ""
            item["skip_reason"] = f"download_failed:{exc}"
            return
        text, skip = _decode_file(item["name"], blob)
        item["content"] = text
        if skip:
            item["skip_reason"] = skip

    def _search(self, client: SeafileClient, scope: dict[str, Any], kwargs: dict[str, Any]) -> dict[str, Any]:
        targets = self._resolve_search_targets(client, scope, kwargs)
        window = resolve_week(
            now=datetime.now(timezone.utc),
            timezone_name=self._param.timezone or "Asia/Shanghai",
            week_mode=self._param.week_mode or "this_week",
            query=self._canvas.get_variable_value("sys.query") or "",
        )
        files: list[dict[str, Any]] = []
        path_notes: list[str] = []
        searched_roots: list[dict[str, str]] = []
        for repo_id, root in targets:
            items = self._walk_files(client, repo_id, root, window)
            used_root = root
            if not items and root != "/":
                path_notes.append(f"{repo_id}:{root} missing or empty, fallback /")
                items = self._walk_files(client, repo_id, "/", window)
                used_root = "/"
            searched_roots.append({"repo_id": repo_id, "path": used_root})
            for item in items:
                item["repo_id"] = repo_id
                self._download_text(client, repo_id, item)
                files.append(item)
        repo_id = targets[0][0] if len(targets) == 1 else ""
        root = searched_roots[0]["path"] if searched_roots else "/"

        by_author: dict[str, list[dict[str, Any]]] = {}
        for item in files:
            by_author.setdefault(item.get("author") or "unknown", []).append(item)
        files_by_author = [{"author": author, "files": rows} for author, rows in sorted(by_author.items())]

        expected = [a.strip() for a in (self._param.expected_authors or []) if str(a).strip()]
        received_authors = {row["author"] for row in files_by_author if row["author"] != "unknown"}
        missing = [name for name in expected if name not in received_authors]
        if not files:
            coverage = "empty"
        elif self._param.require_complete and expected and missing:
            coverage = "blocked"
        elif expected and missing:
            coverage = "insufficient"
        else:
            coverage = "complete"

        return {
            "week_id": window.week_id,
            "previous_week_id": window.previous_week_id,
            "start": window.start.isoformat(),
            "end": window.end.isoformat(),
            "timezone": window.timezone,
            "repo_id": repo_id,
            "path": root,
            "coverage_status": coverage,
            "received_count": len(files),
            "missing_authors": missing,
            "files": files,
            "files_by_author": files_by_author,
            "path_notes": path_notes,
            "searched_roots": searched_roots,
        }

    @timeout(int(os.environ.get("COMPONENT_EXEC_TIMEOUT", 120)))
    def _invoke(self, **kwargs):
        if self.check_if_canceled("Seafile processing"):
            return
        action = (kwargs.get("action") or "search").strip().lower() or "search"
        try:
            connector = self._connector_row()
            client, scope = self._client_and_scope(connector)
            if action == "list_dir":
                repo_id, path = self._resolve_repo_and_path(scope, kwargs, client)
                entries = client.list_dir(repo_id, path)
                payload = {"repo_id": repo_id, "path": path, "entries": entries, "coverage_status": "complete"}
            elif action == "download":
                repo_id, path = self._resolve_repo_and_path(scope, kwargs, client)
                item = {"path": path, "name": os.path.basename(path), "size": 0}
                self._download_text(client, repo_id, item)
                payload = {"repo_id": repo_id, "file": item, "coverage_status": "complete"}
            else:
                payload = self._search(client, scope, kwargs)
        except Exception as exc:
            logger.exception("Seafile tool failed")
            payload = {
                "coverage_status": "empty",
                "received_count": 0,
                "files": [],
                "files_by_author": [],
                "missing_authors": [],
                "week_id": "",
                "previous_week_id": "",
            }
            self.set_output("_ERROR", str(exc))
            self.set_output("json", payload)
            self.set_output("formalized_content", "")
            return payload

        lines = []
        for item in payload.get("files") or []:
            header = f"### {item.get('author', 'unknown')} — {item.get('name')}"
            body = item.get("content") or f"[{item.get('skip_reason') or 'empty'}]"
            lines.append(f"{header}\n{body}")
        formalized = "\n\n".join(lines)
        self.set_output("json", payload)
        self.set_output("formalized_content", formalized)
        self.set_output("week_id", payload.get("week_id") or "")
        return payload
