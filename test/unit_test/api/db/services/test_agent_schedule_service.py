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

import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest


pytestmark = pytest.mark.p1


def _load_agent_schedule_service():
    repo_root = Path(__file__).resolve().parents[5]
    module_path = repo_root / "api" / "db" / "services" / "agent_schedule_service.py"
    spec = importlib.util.spec_from_file_location("test_agent_schedule_service_module", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_drain_scheduled_agent_uses_owner_tenant_and_query():
    agent_schedule_service = _load_agent_schedule_service()

    calls = []

    async def fake_completion(**kwargs):
        calls.append(kwargs)
        yield "data: started\n\n"
        yield "data: done\n\n"

    row = SimpleNamespace(
        id="agent-1",
        user_id="tenant-1",
        schedule_input="make the daily report",
    )

    asyncio.run(
        agent_schedule_service.drain_scheduled_agent(
            row,
            completion_func=fake_completion,
        )
    )

    assert calls == [
        {
            "tenant_id": "tenant-1",
            "agent_id": "agent-1",
            "query": "make the daily report",
            "user_id": "tenant-1",
        }
    ]


def test_failure_update_advances_next_run_to_avoid_tight_retry():
    agent_schedule_service = _load_agent_schedule_service()

    row = SimpleNamespace(
        id="agent-1",
        schedule_config={"type": "interval", "seconds": 300},
    )

    update_fields = agent_schedule_service.build_schedule_update_after_run(
        row,
        now=1_700_000_000,
        run_status="error",
        calc_next_run_time_func=lambda _config: 1_700_000_300,
    )

    assert update_fields == {
        "run_status": "error",
        "last_run_time": 1_700_000_000,
        "next_run_time": 1_700_000_300,
    }


def test_running_schedule_is_stale_only_after_timeout():
    agent_schedule_service = _load_agent_schedule_service()

    row = SimpleNamespace(run_status="running", next_run_time=1_700_000_000)

    assert agent_schedule_service.is_stale_running_schedule(
        row,
        now=1_700_090_001,
        stale_after_seconds=90_000,
    )
    assert not agent_schedule_service.is_stale_running_schedule(
        row,
        now=1_700_000_300,
        stale_after_seconds=90_000,
    )
