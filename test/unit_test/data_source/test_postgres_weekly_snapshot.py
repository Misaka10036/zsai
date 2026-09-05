from datetime import datetime
from zoneinfo import ZoneInfo

from common.data_source.postgres_weekly_snapshot import extract_weekly_mes_data, format_weekly_mes_data
from common.data_source.seafile_week import WeekWindow


def _window() -> WeekWindow:
    tz = ZoneInfo("Asia/Shanghai")
    return WeekWindow(
        week_id="2026-W28",
        start=datetime(2026, 7, 6, tzinfo=tz),
        end=datetime(2026, 7, 12, 23, 59, 59, tzinfo=tz),
        previous_week_id="2026-W27",
        timezone="Asia/Shanghai",
    )


def test_extracts_only_week_rows_from_profile_tables():
    dump = """-- PostgreSQL database dump
COPY public.prod_req (dbid, bzid, name_zh, batch, num, start_time, crt_time, type, stat_code) FROM stdin;
1\tP-1\t动车组\tB1\t12.5\t2026-07-08 09:00:00+08\t2026-07-01 09:00:00+08\t生产\tRUNNING
2\tP-2\t车体\tB2\t3\t2026-06-20 09:00:00+08\t2026-06-20 09:00:00+08\t生产\tDONE
\\.
COPY public.iot_evt (dbid, obj_ver, iot_node_dbid, sub_id, tag_id, type, trans_time) FROM stdin;
1\t1\t2\tS1\tT1\tENTER\t2026-07-09 10:30:00+08
\\.
"""
    result = extract_weekly_mes_data(dump.splitlines(keepends=True), _window(), sample_limit=2)
    assert result["weekly_rows"] == 2
    tables = {table["table"]: table for table in result["tables"]}
    assert tables["prod_req"]["rows"] == 1
    assert tables["prod_req"]["sums"]["num"] == "12.5"
    assert tables["prod_req"]["groups"]["stat_code"] == {"RUNNING": 1}
    assert tables["iot_evt"]["groups"]["type"] == {"ENTER": 1}
    assert "本周生产数据库摘要" in format_weekly_mes_data(result)


def test_ignores_sql_outside_copy_and_counts_malformed_rows():
    dump = """CREATE FUNCTION malicious() RETURNS void AS $$ BEGIN RAISE NOTICE 'never'; END $$ LANGUAGE plpgsql;
COPY public.prod_req (dbid, start_time, crt_time, stat_code, type, num, bzid, name_zh, batch) FROM stdin;
broken
\\.
"""
    result = extract_weekly_mes_data(dump.splitlines(keepends=True), _window())
    assert result["weekly_rows"] == 0
    assert result["malformed_rows"] == 1
