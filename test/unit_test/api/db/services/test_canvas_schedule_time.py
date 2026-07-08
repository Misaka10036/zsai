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

from datetime import datetime, timezone
import importlib.util
from pathlib import Path

import pytest


pytestmark = pytest.mark.p1


def _load_schedule_time():
    repo_root = Path(__file__).resolve().parents[5]
    module_path = repo_root / "api" / "db" / "services" / "schedule_time.py"
    spec = importlib.util.spec_from_file_location("test_schedule_time_module", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_calc_next_run_time_respects_cron_timezone():
    calc_next_run_time = _load_schedule_time().calc_next_run_time

    now = datetime(2026, 1, 1, 0, 30, tzinfo=timezone.utc)

    next_run = calc_next_run_time(
        {"type": "cron", "expr": "0 9 * * *", "tz": "Asia/Shanghai"},
        now=now,
    )

    assert datetime.fromtimestamp(next_run, timezone.utc) == datetime(
        2026,
        1,
        1,
        1,
        0,
        tzinfo=timezone.utc,
    )
