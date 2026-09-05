"""Stream weekly MES facts from a plain PostgreSQL ``pg_dump`` snapshot."""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Iterable

from common.data_source.seafile_week import WeekWindow

COPY_RE = re.compile(r"^COPY public\.([^ ]+) \((.*)\) FROM stdin;$")

# The profile matches dls_mes_20260708235901.sql.  Keep the selection small:
# these tables contain the production facts useful in a weekly report and all
# have a timestamp that can be filtered without joining the entire dump.
MES_WEEKLY_PROFILE = {
    "prod_req": {
        "time": ("start_time", "crt_time"),
        "groups": ("stat_code", "type"),
        "sums": ("num",),
        "sample": ("bzid", "name_zh", "batch", "num", "stat_code"),
        "label": "生产任务计划",
    },
    "seg_req": {
        "time": ("ear_start_time", "crt_time"),
        "groups": ("stat_code",),
        "sums": ("num",),
        "sample": ("bzid", "name_zh", "batch", "num", "stat_code"),
        "label": "工序计划",
    },
    "seg_rep": {
        "time": ("act_start_time", "act_end_time"),
        "groups": ("stat_code",),
        "sums": ("num",),
        "sample": ("bzid", "name_zh", "batch", "num", "stat_code"),
        "label": "工序实绩",
    },
    "prod_req_stat_rec": {
        "time": ("trans_time",),
        "groups": ("task_event", "stage"),
        "sums": (),
        "sample": ("prod_req_dbid", "ppl_name", "task", "task_event", "stage"),
        "label": "生产任务状态变化",
    },
    "tblwipqcitemdetail_zqrail": {
        "time": ("qcdate",),
        "groups": ("qcresult", "qctype"),
        "sums": (),
        "sample": ("productno", "lotno", "opno", "qcitem", "qcresult"),
        "label": "质量检测",
    },
    "meas_stat_rec": {
        "time": ("rec_time",),
        "groups": ("stat_code",),
        "sums": (),
        "sample": ("prod_rep_dbid", "seg_rep_dbid", "eqpt_loc_dbid", "stat_code"),
        "label": "量具状态",
    },
    "measuring_tools_data": {
        "time": ("start_time", "create_time"),
        "groups": ("status", "train_type"),
        "sums": (),
        "sample": ("orderid", "rulerid", "mes_name", "inputvalue", "status"),
        "label": "量具测量",
    },
    "iot_evt": {
        "time": ("trans_time",),
        "groups": ("type",),
        "sums": (),
        "sample": ("sub_id", "tag_id", "type"),
        "label": "物联网事件",
    },
    "iot_evt_prod": {
        "time": ("in_time", "out_time"),
        "groups": ("type",),
        "sums": ("duration",),
        "sample": ("prod_req_dbid", "tag_id", "type", "duration"),
        "label": "产品围栏事件",
    },
    "oee_loss": {
        "time": ("start_time", "rec_time"),
        "groups": ("type",),
        "sums": ("dur", "qty_num"),
        "sample": ("oee_data_dbid", "type", "dur", "qty_num", "rate"),
        "label": "OEE 损失",
    },
}


def _unescape_copy(value: str) -> str | None:
    if value == r"\N":
        return None
    escapes = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\"}
    return re.sub(r"\\([bfnrtv\\])", lambda match: escapes[match.group(1)], value)


def _parse_timestamp(value: str | None, window: WeekWindow) -> datetime | None:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        # qcdate is varchar in this MES schema and occurs in several common
        # formats.  Restrict the fallback so arbitrary values are never guessed.
        parsed = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d", "%Y%m%d%H%M%S", "%Y%m%d"):
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        if parsed is None:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=window.start.tzinfo)
    return parsed.astimezone(window.start.tzinfo)


def extract_weekly_mes_data(lines: Iterable[str], window: WeekWindow, sample_limit: int = 8) -> dict:
    """Parse a pg_dump stream without executing it or retaining the full file."""
    tables = {
        name: {"label": spec["label"], "rows": 0, "groups": {field: Counter() for field in spec["groups"]}, "sums": {field: Decimal(0) for field in spec["sums"]}, "samples": []}
        for name, spec in MES_WEEKLY_PROFILE.items()
    }
    active_table = ""
    in_copy = False
    columns: list[str] = []
    indexes: dict[str, int] = {}
    scanned_rows = 0
    malformed_rows = 0

    for raw_line in lines:
        line = raw_line.rstrip("\r\n")
        if not in_copy:
            if not line.startswith("COPY public."):
                continue
            match = COPY_RE.match(line)
            if not match:
                continue
            in_copy = True
            if match.group(1) in MES_WEEKLY_PROFILE:
                active_table = match.group(1)
                columns = [column.strip().strip('"') for column in match.group(2).split(",")]
                indexes = {column: index for index, column in enumerate(columns)}
            continue
        if line == r"\.":
            in_copy = False
            active_table = ""
            columns = []
            indexes = {}
            continue
        if not active_table:
            continue
        scanned_rows += 1
        values = [_unescape_copy(value) for value in line.split("\t")]
        if len(values) != len(columns):
            malformed_rows += 1
            continue
        spec = MES_WEEKLY_PROFILE[active_table]

        def value(field: str) -> str | None:
            index = indexes.get(field)
            return values[index] if index is not None else None

        occurred_at = None
        for field in spec["time"]:
            occurred_at = _parse_timestamp(value(field), window)
            if occurred_at is not None:
                break
        if occurred_at is None or occurred_at < window.start or occurred_at > window.end:
            continue
        result = tables[active_table]
        result["rows"] += 1
        for field in spec["groups"]:
            result["groups"][field][str(value(field) or "未填写")] += 1
        for field in spec["sums"]:
            try:
                result["sums"][field] += Decimal(str(value(field) or "0"))
            except InvalidOperation:
                pass
        if len(result["samples"]) < sample_limit:
            sample = {field: value(field) for field in spec["sample"] if value(field) not in (None, "")}
            sample["发生时间"] = occurred_at.isoformat()
            result["samples"].append(sample)

    payload_tables = []
    for name, result in tables.items():
        if not result["rows"]:
            continue
        payload_tables.append(
            {
                "table": name,
                "label": result["label"],
                "rows": result["rows"],
                "groups": {field: dict(counter.most_common(20)) for field, counter in result["groups"].items()},
                "sums": {field: str(value) for field, value in result["sums"].items()},
                "samples": result["samples"],
            }
        )
    return {
        "week_id": window.week_id,
        "start": window.start.isoformat(),
        "end": window.end.isoformat(),
        "tables": payload_tables,
        "weekly_rows": sum(table["rows"] for table in payload_tables),
        "scanned_profile_rows": scanned_rows,
        "malformed_rows": malformed_rows,
    }


def format_weekly_mes_data(payload: dict) -> str:
    lines = [
        "## 本周生产数据库摘要",
        f"统计周期：{payload.get('start', '')} 至 {payload.get('end', '')}",
        f"匹配生产记录：{payload.get('weekly_rows', 0)} 条",
    ]
    if payload.get("error"):
        lines.append(f"数据库镜像读取失败：{payload['error']}")
    for table in payload.get("tables") or []:
        lines.append(f"\n### {table['label']}（{table['table']}）：{table['rows']} 条")
        for field, values in (table.get("groups") or {}).items():
            lines.append(f"- {field}：" + "；".join(f"{key}={count}" for key, count in values.items()))
        for field, value in (table.get("sums") or {}).items():
            lines.append(f"- {field} 合计：{value}")
        if table.get("samples"):
            lines.append("- 样例：" + "；".join(str(row) for row in table["samples"]))
    if not payload.get("tables"):
        lines.append("本周未在已配置的生产事实表中找到记录。")
    return "\n".join(lines)
