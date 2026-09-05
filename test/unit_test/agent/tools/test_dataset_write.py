#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from agent.tools.dataset_write import DatasetWrite, DatasetWriteParam
from common.data_source.seafile_week import render_weekly_report, weekly_report_filename


def _make_tool(output_format="md", repo="周报", path="/", connector_id="conn-1"):
    tool = DatasetWrite.__new__(DatasetWrite)
    param = DatasetWriteParam()
    param.output_format = output_format
    param.seafile_repo_id = repo
    param.seafile_path = path
    param.seafile_connector_id = connector_id
    param.dataset_ids = ["kb-1"]
    param.publish_policy = "auto"
    param.language = "zh"
    tool._param = param
    tool.check_if_canceled = lambda *a, **k: False
    outputs = {}
    tool.set_output = lambda k, v: outputs.__setitem__(k, v)
    tool.output = lambda k=None: outputs.get(k) if k else outputs
    tool._canvas = SimpleNamespace(
        get_tenant_id=lambda: "tenant-1",
        get_variable_value=lambda value: value,
    )
    return tool, outputs


def test_dataset_write_report_file_uses_shipped_renderer():
    tool, _ = _make_tool(output_format="docx")
    markdown = "## 摘要\nWEEKLY-REPORT-PROBE"
    filename, blob = tool._report_file("2026-W33", markdown)
    assert filename == weekly_report_filename("2026-W33", "docx")
    assert blob == render_weekly_report(markdown, "docx")
    assert filename.endswith(".docx")
    assert blob[:2] == b"PK"


def test_dataset_write_report_file_rejects_bad_week():
    tool, _ = _make_tool()
    with pytest.raises(ValueError):
        tool._report_file("not-a-week", "body")


def test_dataset_write_seafile_uploads_converted_bytes(monkeypatch):
    tool, _ = _make_tool(output_format="pdf")
    markdown = "## 摘要\nWEEKLY-REPORT-PROBE"
    filename, blob = tool._report_file("2026-W33", markdown)

    captured = {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            captured["client_args"] = (args, kwargs)

        def list_libraries(self):
            return [{"id": "week-id", "name": "周报"}]

        def upsert_file(self, repo_id, path, name, content, content_type=None):
            captured["upsert"] = {
                "repo_id": repo_id,
                "path": path,
                "name": name,
                "content": content,
                "content_type": content_type,
            }
            return {"action": "created", "path": f"{path.rstrip('/')}/{name}"}

    fake_connector = SimpleNamespace(
        id="conn-1",
        source="seafile",
        config={"seafile_url": "http://seafile", "credentials": {"seafile_token": "tok"}},
    )

    class FakeConnectorService:
        @staticmethod
        def accessible(connector_id, tenant_id):
            return connector_id == "conn-1" and tenant_id == "tenant-1"

        @staticmethod
        def get_by_id(connector_id):
            return True, fake_connector

    import api.db.services.connector_service as connector_mod
    import agent.tools.dataset_write as dw

    monkeypatch.setattr(connector_mod, "ConnectorService", FakeConnectorService)
    monkeypatch.setattr(dw, "SeafileClient", FakeClient)

    result = tool._write_seafile(filename, blob)
    assert result["action"] == "created"
    assert captured["upsert"]["name"] == filename
    assert captured["upsert"]["content"] == blob
    assert captured["upsert"]["repo_id"] == "week-id"
    assert captured["upsert"]["path"] == "/"
    assert captured["upsert"]["content_type"] == "application/pdf"


def test_dataset_write_invoke_publishes_chosen_format(monkeypatch):
    tool, outputs = _make_tool(output_format="docx")
    markdown = "## 摘要\nWEEKLY-REPORT-PROBE"
    expected_name = weekly_report_filename("2026-W33", "docx")
    expected_blob = render_weekly_report(markdown, "docx")
    uploaded = {}

    class FakeKBService:
        @staticmethod
        def accessible(dataset_id, tenant_id):
            return True

        @staticmethod
        def get_by_id(dataset_id):
            return True, SimpleNamespace(id=dataset_id)

    class FakeDocService:
        @staticmethod
        def query(**kwargs):
            return []

        @staticmethod
        def get_by_id(doc_id):
            return True, SimpleNamespace(id=doc_id, to_dict=lambda: {"id": doc_id})

        @staticmethod
        def update_by_id(doc_id, payload):
            return True

        @staticmethod
        def run(tenant_id, doc, extra):
            return None

    class FakeMeta:
        @staticmethod
        def update_document_metadata(doc_id, meta):
            uploaded["meta"] = meta

    class FakeFileService:
        @staticmethod
        def upload_document(kb, files, tenant_id):
            upload = files[0]
            uploaded["filename"] = upload.filename
            uploaded["blob"] = upload.read()
            return [], [({"id": "doc-1"}, None)]

    import api.db.services.document_service as doc_mod
    import api.db.services.doc_metadata_service as meta_mod
    import api.db.services.file_service as file_mod
    import api.db.services.knowledgebase_service as kb_mod

    monkeypatch.setattr(kb_mod, "KnowledgebaseService", FakeKBService)
    monkeypatch.setattr(doc_mod, "DocumentService", FakeDocService)
    monkeypatch.setattr(meta_mod, "DocMetadataService", FakeMeta)
    monkeypatch.setattr(file_mod, "FileService", FakeFileService)
    monkeypatch.setattr(tool, "_write_seafile", lambda filename, content: {"action": "created", "path": f"/周报/{filename}"})

    result = tool._invoke(week_id="2026-W33", content=markdown)
    assert result["filename"] == expected_name
    assert result["output_format"] == "docx"
    assert uploaded["filename"] == expected_name
    assert uploaded["blob"] == expected_blob
    assert uploaded["meta"]["output_format"] == "docx"
    assert outputs["json"]["filename"] == expected_name
