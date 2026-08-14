import importlib.util
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest


def _load_week():
    path = Path(__file__).resolve().parents[3] / "common" / "data_source" / "seafile_week.py"
    spec = importlib.util.spec_from_file_location("seafile_week_under_test", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


week = _load_week()


def test_normalise_path():
    assert week.normalise_path(None) == "/"
    assert week.normalise_path("日报/2026") == "/日报/2026"
    assert week.normalise_path("/日报/2026/") == "/日报/2026"


def test_parse_mtime_unix_and_iso():
    ts = week.parse_mtime(1700000000)
    assert ts.tzinfo is not None
    iso = week.parse_mtime("2026-02-15T17:26:53+01:00")
    assert iso.year == 2026


def test_host_of():
    assert week.host_of("https://SeaFile.Example.com:8080/a") == "seafile.example.com"


def test_rewrite_docker_internal_on_host():
    url, hosts = week.rewrite_seafile_url_for_runtime("http://host.docker.internal:8082/")
    if week.running_in_docker():
        assert "host.docker.internal" in url
    else:
        assert url == "http://127.0.0.1:8082"
        assert "127.0.0.1" in hosts


def test_path_in_scope_directory_jail():
    assert week.path_in_scope("/日报/2026/08/a.md", "/日报")
    assert week.path_in_scope("/日报", "/日报")
    assert not week.path_in_scope("/其他/a.md", "/日报")
    assert not week.path_in_scope("/日报备份/a.md", "/日报")


def test_resolve_week_this_week_includes_today():
    now = datetime(2026, 8, 14, 10, 0, tzinfo=timezone.utc)
    window = week.resolve_week(now=now, timezone_name="Asia/Shanghai", week_mode="this_week")
    assert window.week_id.startswith("2026-W")
    assert window.end.date().isoformat() == "2026-08-14"


def test_resolve_week_from_query():
    now = datetime(2026, 8, 14, 10, 0, tzinfo=timezone.utc)
    window = week.resolve_week(now=now, query="请生成 2026-W32 周报", week_mode="this_week")
    assert window.week_id == "2026-W32"
    assert window.previous_week_id == "2026-W31"


def test_weekly_report_filename():
    assert week.weekly_report_filename("2026-W33") == "weekly-report-2026-W33.md"
    with pytest.raises(ValueError):
        week.weekly_report_filename("notes.md")


def test_parse_report_date_accepts_unpadded_and_dotted():
    assert week.parse_report_date("2026-8-14").isoformat() == "2026-08-14"
    assert week.parse_report_date("2026.8.13").isoformat() == "2026-08-13"
    assert week.parse_report_date("张三-2026-08-11.md").isoformat() == "2026-08-11"
    assert week.parse_report_date("notes.md") is None


def test_file_in_week_prefers_filename_date_over_mtime():
    now = datetime(2026, 8, 14, 12, 0, tzinfo=timezone.utc)
    window = week.resolve_week(now=now, timezone_name="Asia/Shanghai", week_mode="this_week")
    old_mtime = datetime(2025, 1, 1, tzinfo=timezone.utc).timestamp()
    assert week.file_in_week(window, "2026-8-14", old_mtime)
    assert not week.file_in_week(window, "2026-8-01", old_mtime)


def test_search_roots_treats_matching_library_name_as_root():
    libraries = [
        {"id": "daily-id", "name": "日报"},
        {"id": "week-id", "name": "周报"},
    ]
    assert week.search_roots_for_libraries(libraries, "/日报") == [("daily-id", "/")]
    assert week.search_roots_for_libraries(libraries, "/") == [
        ("daily-id", "/"),
        ("week-id", "/"),
    ]
