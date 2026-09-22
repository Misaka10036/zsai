#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
from types import SimpleNamespace

from agent.tools.production_data import ProductionData, ProductionDataParam, SnapshotNotFound
from common.data_source.postgres_weekly_snapshot import format_weekly_mes_data


def _tool(skip_if_missing):
    tool = ProductionData.__new__(ProductionData)
    param = ProductionDataParam()
    param.skip_if_missing = skip_if_missing
    param.timezone = "Asia/Shanghai"
    param.week_mode = "this_week"
    tool._param = param
    tool.check_if_canceled = lambda *args, **kwargs: False
    outputs = {}

    def set_output(key, value):
        outputs[key] = value

    tool.set_output = set_output
    tool._canvas = SimpleNamespace(get_variable_value=lambda _name: "")
    tool._connector_row = lambda: object()
    tool._client_and_scope = lambda _connector: (object(), {})
    return tool, outputs


def test_missing_snapshot_is_skipped_without_failing_the_run():
    tool, outputs = _tool(True)

    def missing(_client, _scope):
        raise SnapshotNotFound("配置的 Seafile 目录中没有匹配的 .sql 或 .sql.gz PostgreSQL 镜像。")

    tool._latest_snapshot = missing
    tool._invoke()
    assert "_ERROR" not in outputs
    assert outputs["json"]["coverage_status"] == "skipped"
    assert outputs["json"]["week_id"]
    assert "已跳过生产数据" in outputs["formalized_content"]
    assert "读取失败" not in outputs["formalized_content"]


def test_missing_snapshot_still_fails_when_skip_is_off():
    tool, outputs = _tool(False)
    tool._latest_snapshot = lambda _client, _scope: (_ for _ in ()).throw(SnapshotNotFound("missing"))
    tool._invoke()
    assert outputs["_ERROR"] == "missing"
    assert outputs["json"]["coverage_status"] == "error"


def test_other_failures_still_stop_the_run_when_skip_is_on():
    tool, outputs = _tool(True)

    def broken():
        raise ValueError("Seafile connector is not accessible")

    tool._connector_row = broken
    tool._invoke()
    assert "not accessible" in outputs["_ERROR"]
    assert outputs["json"]["coverage_status"] == "error"


def test_skipped_summary_does_not_claim_empty_tables():
    text = format_weekly_mes_data({"coverage_status": "skipped", "week_id": "2026-W38", "start": "a", "end": "b", "weekly_rows": 0})
    assert "已跳过生产数据" in text
    assert "生产事实表" not in text
