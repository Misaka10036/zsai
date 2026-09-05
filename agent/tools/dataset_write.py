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
from abc import ABC
from typing import Any

from agent.tools.base import ToolBase, ToolMeta, ToolParamBase
from common.connection_utils import timeout
from common.constants import TaskStatus
from common.data_source.seafile_client import SeafileClient
from common.data_source.seafile_week import (
    WEEK_ID_RE,
    normalize_weekly_output_format,
    render_weekly_report,
    resolve_library_id,
    seafile_publish_configured,
    weekly_report_content_type,
    weekly_report_filename,
)

logger = logging.getLogger(__name__)

FILENAME_RE = re.compile(r"^weekly-report-\d{4}-W\d{2}\.(md|docx|pdf)$")


class _MemoryUpload:
    def __init__(self, filename: str, blob: bytes, doc_id: str | None = None):
        self.filename = filename
        self._blob = blob
        if doc_id:
            self.id = doc_id

    def read(self) -> bytes:
        return self._blob


class DatasetWriteParam(ToolParamBase):
    def __init__(self):
        self.meta: ToolMeta = {
            "name": "write_my_dataset",
            "description": "Write the generated weekly report markdown into the configured dataset. Filename is computed from week_id.",
            "parameters": {
                "content": {
                    "type": "string",
                    "description": "Weekly report markdown.",
                    "default": "",
                    "required": False,
                },
                "week_id": {
                    "type": "string",
                    "description": "ISO week id such as 2026-W33.",
                    "default": "",
                    "required": False,
                },
            },
        }
        super().__init__()
        self.dataset_ids: list[str] = []
        self.kb_ids: list[str] = []
        self.publish_policy = "auto"
        self.language = "zh"
        self.seafile_connector_id = ""
        self.seafile_repo_id = ""
        self.seafile_path = ""
        self.output_format = "md"

    def check(self):
        policy = (self.publish_policy or "auto").lower()
        if policy not in {"auto", "draft"}:
            raise ValueError("publish_policy must be auto or draft")
        self.output_format = normalize_weekly_output_format(getattr(self, "output_format", "md"))

    def get_input_form(self) -> dict[str, dict]:
        return {
            "content": {"name": "Content", "type": "line", "optional": True},
            "week_id": {"name": "Week id", "type": "line", "optional": True},
        }


class DatasetWrite(ToolBase, ABC):
    component_name = "DatasetWrite"

    @property
    def _dataset_ids(self) -> list[str]:
        return self._param.dataset_ids or getattr(self._param, "kb_ids", None) or []

    def _resolve_dataset_id(self) -> str:
        from api.db.services.knowledgebase_service import KnowledgebaseService

        ids = [i for i in self._dataset_ids if i]
        if len(ids) != 1:
            raise ValueError("DatasetWrite requires exactly one dataset_id.")
        dataset_id = ids[0]
        if "@" in dataset_id:
            dataset_id = str(self._canvas.get_variable_value(dataset_id) or dataset_id)
        tenant_id = self._canvas.get_tenant_id()
        if not KnowledgebaseService.accessible(dataset_id, tenant_id):
            raise PermissionError("Weekly-report dataset is not accessible to this canvas owner.")
        return dataset_id

    def _resolve_text(self, value: Any) -> str:
        text = "" if value is None else str(value).strip()
        if text.startswith("{") or "@" in text:
            text = str(self._canvas.get_variable_value(text) or "").strip()
        return text

    def _write_seafile(self, filename: str, content: bytes) -> dict[str, Any] | None:
        repo = self._resolve_text(getattr(self._param, "seafile_repo_id", ""))
        path = self._resolve_text(getattr(self._param, "seafile_path", ""))
        if not seafile_publish_configured(repo, path):
            return None
        connector_id = self._resolve_text(getattr(self._param, "seafile_connector_id", ""))
        from api.db.services.connector_service import ConnectorService

        tenant_id = self._canvas.get_tenant_id()
        connector = None
        if connector_id:
            if not ConnectorService.accessible(connector_id, tenant_id):
                raise PermissionError("Seafile connector is not accessible to this canvas owner.")
            ok, connector = ConnectorService.get_by_id(connector_id)
            if not ok:
                raise ValueError(f"Seafile connector {connector_id} was not found.")
        else:
            for row in ConnectorService.query(tenant_id=tenant_id, source="seafile") or []:
                connector = row
                break
        if connector is None:
            raise ValueError("已填写 Seafile 资料库和路径，但没有可用的 Seafile 数据源。")
        source = (getattr(connector, "source", "") or "").lower()
        if source != "seafile":
            raise ValueError(f"Connector {getattr(connector, 'id', '')} is source={source!r}, expected seafile.")
        config = connector.config or {}
        credentials = config.get("credentials") or {}
        client = SeafileClient(
            config.get("seafile_url") or "",
            token=credentials.get("seafile_token") or config.get("seafile_token"),
            repo_token=credentials.get("repo_token") or config.get("repo_token"),
            download_hosts=list(config.get("download_hosts") or []),
        )
        repo_id = resolve_library_id(client.list_libraries(), repo)
        uploaded = client.upsert_file(
            repo_id,
            path,
            filename,
            content,
            content_type=weekly_report_content_type(self._output_format()),
        )
        uploaded["repo_id"] = repo_id
        return uploaded

    def _output_format(self) -> str:
        return normalize_weekly_output_format(getattr(self._param, "output_format", "md"))

    def _report_file(self, week_id: str, content: Any) -> tuple[str, bytes]:
        if content is None:
            content = ""
        if not isinstance(content, str):
            content = str(content)
        fmt = self._output_format()
        filename = weekly_report_filename(week_id, fmt)
        if not FILENAME_RE.fullmatch(filename):
            raise ValueError(f"computed filename rejected: {filename}")
        return filename, render_weekly_report(content, fmt)

    def _resolve_week_id(self, kwargs: dict[str, Any]) -> str:
        week_id = (kwargs.get("week_id") or getattr(self._param, "week_id", "") or "").strip()
        if "@" in week_id or week_id.startswith("{"):
            week_id = str(self._canvas.get_variable_value(week_id) or "")
        if not WEEK_ID_RE.fullmatch(week_id):
            raise ValueError(f"DatasetWrite week_id must look like YYYY-Www, got {week_id!r}")
        return week_id

    @timeout(int(os.environ.get("COMPONENT_EXEC_TIMEOUT", 120)))
    def _invoke(self, **kwargs):
        if self.check_if_canceled("DatasetWrite processing"):
            return

        policy = (self._param.publish_policy or "auto").lower()
        if policy == "draft":
            result = {"action": "skipped", "reason": "publish_policy=draft"}
            self.set_output("json", result)
            self.set_output("formalized_content", "DatasetWrite skipped (draft).")
            return result

        try:
            from api.db.services.document_service import DocumentService
            from api.db.services.doc_metadata_service import DocMetadataService
            from api.db.services.file_service import FileService
            from api.db.services.knowledgebase_service import KnowledgebaseService

            dataset_id = self._resolve_dataset_id()
            week_id = self._resolve_week_id(kwargs)
            filename, blob = self._report_file(week_id, kwargs.get("content"))
            fmt = self._output_format()

            ok, kb = KnowledgebaseService.get_by_id(dataset_id)
            if not ok:
                raise ValueError(f"Dataset {dataset_id} was not found.")

            existing = list(DocumentService.query(name=filename, kb_id=dataset_id))
            if len(existing) > 1:
                raise RuntimeError(f"ambiguous_name: {len(existing)} documents named {filename} in dataset {dataset_id}")

            tenant_id = self._canvas.get_tenant_id()
            if existing:
                upload = _MemoryUpload(filename, blob, doc_id=existing[0].id)
            else:
                upload = _MemoryUpload(filename, blob)

            err, files = FileService.upload_document(kb, [upload], tenant_id)
            if err:
                raise RuntimeError("; ".join(err))
            if not files:
                raise RuntimeError("DatasetWrite upload returned no document.")

            doc, _stored = files[0]
            doc_id = doc["id"] if isinstance(doc, dict) else doc.id
            DocMetadataService.update_document_metadata(
                doc_id,
                {
                    "week_id": week_id,
                    "language": self._param.language or "zh",
                    "kind": "weekly_report",
                    "output_format": fmt,
                },
            )
            ok, fresh = DocumentService.get_by_id(doc_id)
            if ok:
                DocumentService.update_by_id(
                    doc_id,
                    {
                        "run": TaskStatus.UNSTART.value,
                        "progress": 0,
                        "progress_msg": "",
                    },
                )
                ok, fresh = DocumentService.get_by_id(doc_id)
                DocumentService.run(tenant_id, fresh.to_dict(), {})

            result = {
                "action": "replaced" if existing else "created",
                "document_id": doc_id,
                "filename": filename,
                "week_id": week_id,
                "dataset_id": dataset_id,
                "output_format": fmt,
                "ingest": "queued",
            }
            seafile = self._write_seafile(filename, blob)
            if seafile:
                result["seafile"] = seafile
                summary = f"Wrote {filename} ({result['action']}). Seafile {seafile.get('path')} ({seafile.get('action')})."
            else:
                result["seafile"] = {"action": "skipped"}
                summary = f"Wrote {filename} ({result['action']})."
            self.set_output("json", result)
            self.set_output("formalized_content", summary)
            return result
        except Exception as exc:
            logger.exception("DatasetWrite failed")
            self.set_output("_ERROR", str(exc))
            self.set_output("json", {"action": "error", "error": str(exc)})
            self.set_output("formalized_content", "")
            return str(exc)
