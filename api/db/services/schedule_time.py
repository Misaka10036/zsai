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

import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from croniter import croniter


def _now_timestamp(now=None):
    if now is None:
        return int(time.time())
    if isinstance(now, datetime):
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        return int(now.timestamp())
    return int(now)


def calc_next_run_time(schedule_config, now=None):
    """Compute the next run Unix timestamp from a schedule config dict."""
    cfg_type = schedule_config.get("type")
    if cfg_type == "cron":
        tz_name = schedule_config.get("tz") or "UTC"
        try:
            tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"Unknown timezone: {tz_name}") from exc

        base = now or datetime.now(timezone.utc)
        if not isinstance(base, datetime):
            base = datetime.fromtimestamp(int(base), timezone.utc)
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        base = base.astimezone(tz)

        cron = croniter(schedule_config["expr"], base)
        return int(cron.get_next(datetime).timestamp())

    if cfg_type == "interval":
        seconds = schedule_config.get("seconds", 3600)
        if seconds < 60:
            seconds = 60
        return _now_timestamp(now) + seconds

    raise ValueError(f"Unknown schedule type: {cfg_type}")
