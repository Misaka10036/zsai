#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#
from __future__ import annotations

import gzip
import io
import logging
import os
import re
from abc import ABC
from datetime import datetime, timezone
from typing import Any

from agent.tools.base import ToolMeta, ToolParamBase
from agent.tools.seafile import Seafile
from common.connection_utils import timeout
from common.data_source.postgres_weekly_snapshot import extract_weekly_mes_data, format_weekly_mes_data
from common.data_source.seafile_week import normalise_path, parse_mtime, resolve_week

logger = logging.getLogger(__name__)
DEFAULT_SNAPSHOT_REGEX = r".*\.sql(?:\.gz)?$"


class SnapshotNotFound(ValueError):
    """No snapshot file matched the configured library, directory, and filename pattern."""


class ProductionDataParam(ToolParamBase):
    def __init__(self):
        self.meta: ToolMeta = {
            "name": "fetch_weekly_production_data",
            "description": "Read this week's production facts from the latest PostgreSQL pg_dump snapshot stored in Seafile.",
            "parameters": {},
        }
        super().__init__()
        self.connector_id = ""
        self.path = "/"
        self.default_repo_id = ""
        self.filename_regex = DEFAULT_SNAPSHOT_REGEX
        self.week_mode = "this_week"
        self.timezone = "Asia/Shanghai"
        self.download_hosts: list[str] = []
        self.sample_limit = 8
        self.skip_if_missing = False

    def check(self):
        self.check_positive_integer(self.sample_limit, "Sample limit")
        self.check_boolean(self.skip_if_missing, "Skip when no snapshot file")
        try:
            re.compile(self.filename_regex or DEFAULT_SNAPSHOT_REGEX)
        except re.error as exc:
            raise ValueError(f"invalid snapshot filename_regex: {exc}") from exc

    def get_input_form(self) -> dict[str, dict]:
        return {}


class ProductionData(Seafile, ABC):
    """Fetch and stream a trusted-format data snapshot without executing SQL."""

    component_name = "ProductionData"

    def _walk_snapshots(self, client, repo_id: str, root: str) -> list[dict[str, Any]]:
        pattern = re.compile(self._param.filename_regex or DEFAULT_SNAPSHOT_REGEX, re.IGNORECASE)
        found: list[dict[str, Any]] = []

        def walk(path: str) -> None:
            for entry in client.list_dir(repo_id, path):
                name = str(entry.get("name") or "")
                item_path = f"{path.rstrip('/')}/{name}" or "/"
                if entry.get("type") == "dir":
                    walk(item_path)
                elif entry.get("type") == "file" and pattern.fullmatch(name):
                    found.append(
                        {
                            "repo_id": repo_id,
                            "path": normalise_path(item_path),
                            "name": name,
                            "size": int(entry.get("size") or 0),
                            "mtime": parse_mtime(entry.get("mtime")),
                        }
                    )

        walk(root)
        return found

    def _latest_snapshot(self, client, scope: dict[str, Any]) -> dict[str, Any]:
        targets = self._resolve_search_targets(client, scope, {})
        files: list[dict[str, Any]] = []
        for repo_id, root in targets:
            found = self._walk_snapshots(client, repo_id, root)
            if not found and root != "/":
                found = self._walk_snapshots(client, repo_id, "/")
            files.extend(found)
        if not files:
            raise SnapshotNotFound("配置的 Seafile 目录中没有匹配的 .sql 或 .sql.gz PostgreSQL 镜像。")
        return max(files, key=lambda item: (item["mtime"], item["name"]))

    def _read_snapshot(self, client, item: dict[str, Any], window) -> dict:
        link = client.get_download_link(item["repo_id"], item["path"])
        if not link:
            raise ValueError(f"Seafile 没有返回镜像下载地址：{item['path']}")
        response = client.open_download(link, timeout=int(os.environ.get("PRODUCTION_SNAPSHOT_READ_TIMEOUT", 600)))
        try:
            binary = response.raw
            if item["name"].lower().endswith(".gz"):
                binary = gzip.GzipFile(fileobj=binary)
            text = io.TextIOWrapper(binary, encoding="utf-8", errors="replace", newline="")
            try:
                return extract_weekly_mes_data(text, window, sample_limit=int(self._param.sample_limit))
            finally:
                text.detach()
        finally:
            response.close()

    @timeout(int(os.environ.get("PRODUCTION_SNAPSHOT_EXEC_TIMEOUT", 1800)))
    def _invoke(self, **kwargs):
        if self.check_if_canceled("ProductionData processing"):
            return
        try:
            connector = self._connector_row()
            client, scope = self._client_and_scope(connector)
            window = resolve_week(
                now=datetime.now(timezone.utc),
                timezone_name=self._param.timezone or "Asia/Shanghai",
                week_mode=self._param.week_mode or "this_week",
                query=self._canvas.get_variable_value("sys.query") or "",
            )
            try:
                snapshot = self._latest_snapshot(client, scope)
            except SnapshotNotFound as exc:
                if not self._param.skip_if_missing:
                    raise
                logger.info("ProductionData skipped because no snapshot file was found: %s", exc)
                payload = {
                    "coverage_status": "skipped",
                    "weekly_rows": 0,
                    "tables": [],
                    "week_id": window.week_id,
                    "start": window.start.isoformat(),
                    "end": window.end.isoformat(),
                    "skipped": True,
                }
            else:
                payload = self._read_snapshot(client, snapshot, window)
                payload["snapshot"] = {
                    "repo_id": snapshot["repo_id"],
                    "path": snapshot["path"],
                    "name": snapshot["name"],
                    "size": snapshot["size"],
                    "mtime": snapshot["mtime"].isoformat(),
                }
                payload["coverage_status"] = "complete" if payload["weekly_rows"] else "empty"
        except Exception as exc:
            logger.exception("ProductionData failed")
            payload = {"coverage_status": "error", "weekly_rows": 0, "tables": [], "week_id": "", "error": str(exc)}
            self.set_output("_ERROR", str(exc))
        formalized = format_weekly_mes_data(payload)
        self.set_output("json", payload)
        self.set_output("formalized_content", formalized)
        self.set_output("week_id", payload.get("week_id") or "")
        return payload
