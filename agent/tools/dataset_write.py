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
from common.data_source.seafile_week import WEEK_ID_RE, weekly_report_filename

logger = logging.getLogger(__name__)

FILENAME_RE = re.compile(r"^weekly-report-\d{4}-W\d{2}\.md$")


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

    def check(self):
        policy = (self.publish_policy or "auto").lower()
        if policy not in {"auto", "draft"}:
            raise ValueError("publish_policy must be auto or draft")

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
            filename = weekly_report_filename(week_id)
            content = kwargs.get("content")
            if content is None:
                content = ""
            if not isinstance(content, str):
                content = str(content)
            blob = content.encode("utf-8")

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
                "ingest": "queued",
            }
            self.set_output("json", result)
            self.set_output("formalized_content", f"Wrote {filename} ({result['action']}).")
            return result
        except Exception as exc:
            logger.exception("DatasetWrite failed")
            self.set_output("_ERROR", str(exc))
            self.set_output("json", {"action": "error", "error": str(exc)})
            self.set_output("formalized_content", "")
            return str(exc)
