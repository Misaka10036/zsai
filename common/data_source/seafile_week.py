"""Deterministic ISO-week resolution and path helpers for Seafile weekly reports."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)


def normalise_path(path: Optional[str]) -> str:
    if not path:
        return "/"
    path = path.strip()
    if not path.startswith("/"):
        path = f"/{path}"
    return path.rstrip("/") or "/"


def parse_mtime(raw_mtime) -> datetime:
    if not raw_mtime:
        return datetime.now(timezone.utc)
    if isinstance(raw_mtime, (int, float)):
        return datetime.fromtimestamp(raw_mtime, tz=timezone.utc)
    if isinstance(raw_mtime, str):
        try:
            return datetime.fromtimestamp(int(raw_mtime), tz=timezone.utc)
        except ValueError:
            pass
        try:
            return datetime.fromisoformat(raw_mtime)
        except ValueError:
            pass
    logger.warning("Unparseable mtime %r, using current time", raw_mtime)
    return datetime.now(timezone.utc)


def host_of(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def running_in_docker() -> bool:
    return Path("/.dockerenv").exists()


def rewrite_seafile_url_for_runtime(seafile_url: str) -> tuple[str, list[str]]:
    """Rewrite Docker-only hostnames when RAGFlow is running on the host.

    Data-source configs often store ``http://host.docker.internal:8082`` so a
    container can reach Seafile on the host. The host Python process must use
    127.0.0.1 instead — ``host.docker.internal`` resolves to a LAN address
    that commonly returns 502.
    """
    raw = (seafile_url or "").rstrip("/")
    parsed = urlparse(raw)
    hosts: list[str] = []
    hostname = (parsed.hostname or "").lower()
    if hostname:
        hosts.append(hostname)
    if hostname == "host.docker.internal" and not running_in_docker():
        port = parsed.port
        new_host = f"127.0.0.1:{port}" if port else "127.0.0.1"
        rewritten = parsed._replace(netloc=new_host).geturl().rstrip("/")
        hosts.extend(["127.0.0.1", "localhost"])
        logger.info("Rewrote Seafile URL %s -> %s for host runtime", raw, rewritten)
        return rewritten, hosts
    return raw, hosts


def path_in_scope(path: str, sync_path: str) -> bool:
    path = normalise_path(path)
    sync_path = normalise_path(sync_path)
    if sync_path == "/":
        return True
    return path == sync_path or path.startswith(sync_path.rstrip("/") + "/")

WEEK_ID_RE = re.compile(r"(\d{4})-W(\d{2})")
DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
FLEX_DATE_RE = re.compile(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})")


@dataclass(frozen=True)
class WeekWindow:
    week_id: str
    start: datetime
    end: datetime
    previous_week_id: str
    timezone: str


def iso_week_id(value: date) -> str:
    iso = value.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def week_bounds(week_id: str, tz: ZoneInfo) -> tuple[datetime, datetime]:
    match = WEEK_ID_RE.fullmatch(week_id)
    if not match:
        raise ValueError(f"invalid week_id {week_id!r}")
    year = int(match.group(1))
    week = int(match.group(2))
    monday = date.fromisocalendar(year, week, 1)
    sunday = monday + timedelta(days=6)
    start = datetime(monday.year, monday.month, monday.day, tzinfo=tz)
    end = datetime(sunday.year, sunday.month, sunday.day, 23, 59, 59, tzinfo=tz)
    return start, end


def previous_iso_week_id(week_id: str) -> str:
    match = WEEK_ID_RE.fullmatch(week_id)
    if not match:
        raise ValueError(f"invalid week_id {week_id!r}")
    year = int(match.group(1))
    week = int(match.group(2))
    monday = date.fromisocalendar(year, week, 1) - timedelta(days=7)
    return iso_week_id(monday)


def parse_week_from_query(query: str) -> str | None:
    if not query:
        return None
    week_match = WEEK_ID_RE.search(query)
    if week_match:
        return f"{week_match.group(1)}-W{week_match.group(2)}"
    date_match = DATE_RE.search(query)
    if date_match:
        day = date(int(date_match.group(1)), int(date_match.group(2)), int(date_match.group(3)))
        return iso_week_id(day)
    return None


def resolve_week(
    now: datetime | None = None,
    timezone_name: str = "Asia/Shanghai",
    week_mode: str = "this_week",
    query: str = "",
) -> WeekWindow:
    try:
        tz = ZoneInfo(timezone_name or "Asia/Shanghai")
    except Exception:
        tz = ZoneInfo("Asia/Shanghai")
        timezone_name = "Asia/Shanghai"

    if now is None:
        now = datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    local_now = now.astimezone(tz)
    local_today = local_now.date()

    week_id = parse_week_from_query(query or "")
    mode = (week_mode or "this_week").strip()
    if not week_id:
        if mode == "last_complete_week":
            last_sunday = local_today - timedelta(days=local_today.isoweekday())
            week_id = iso_week_id(last_sunday)
        else:
            week_id = iso_week_id(local_today)

    start, end = week_bounds(week_id, tz)
    if mode != "last_complete_week" and end > local_now:
        end = local_now
    return WeekWindow(
        week_id=week_id,
        start=start,
        end=end,
        previous_week_id=previous_iso_week_id(week_id),
        timezone=timezone_name,
    )


def weekly_report_filename(week_id: str) -> str:
    if not WEEK_ID_RE.fullmatch(week_id or ""):
        raise ValueError(f"week_id must look like YYYY-Www, got {week_id!r}")
    return f"weekly-report-{week_id}.md"


def parse_report_date(value: str | None) -> date | None:
    if not value:
        return None
    match = FLEX_DATE_RE.search(str(value))
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def file_in_week(window: WeekWindow, report_date: str = "", mtime=None) -> bool:
    """Prefer the date encoded in the filename, then fall back to mtime."""
    parsed = parse_report_date(report_date)
    if parsed is not None:
        return window.start.date() <= parsed <= window.end.date()
    modified = parse_mtime(mtime)
    if modified.tzinfo is None:
        modified = modified.replace(tzinfo=timezone.utc)
    start = window.start if window.start.tzinfo else window.start.replace(tzinfo=timezone.utc)
    end = window.end if window.end.tzinfo else window.end.replace(tzinfo=timezone.utc)
    return start <= modified <= end


def search_roots_for_libraries(libraries: list[dict], requested_path: str) -> list[tuple[str, str]]:
    """Map a path onto libraries.

    If the path is a single segment that matches a library name (e.g. ``/日报``
    when a library is named 日报), search that library from ``/``. Otherwise
    search each library from the requested path.
    """
    path = normalise_path(requested_path)
    name = path.strip("/")
    roots: list[tuple[str, str]] = []
    named: list[tuple[str, str]] = []
    for lib in libraries or []:
        lib_id = (lib.get("id") or "").strip()
        if not lib_id:
            continue
        lib_name = (lib.get("name") or "").strip()
        if name and lib_name == name:
            named.append((lib_id, "/"))
        else:
            roots.append((lib_id, path))
    return named or roots
