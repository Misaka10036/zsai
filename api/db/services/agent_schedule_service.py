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

import os


AGENT_SCHEDULE_STALE_SECONDS = int(
    os.environ.get("RAGFLOW_AGENT_SCHEDULE_STALE_SECONDS", str(24 * 60 * 60))
)


def _calc_next_run_time(schedule_config):
    from api.db.services.schedule_time import calc_next_run_time

    return calc_next_run_time(schedule_config)


async def drain_scheduled_agent(canvas_row, completion_func=None, stop_event=None):
    """Run a scheduled agent through the normal completion path and drain output."""
    if completion_func is None:
        from api.db.services.canvas_service import completion as completion_func

    async for _ in completion_func(
        tenant_id=canvas_row.user_id,
        agent_id=canvas_row.id,
        query=canvas_row.schedule_input or "",
        user_id=canvas_row.user_id,
    ):
        if stop_event is not None and stop_event.is_set():
            break


def build_schedule_update_after_run(
    canvas_row,
    *,
    now,
    run_status,
    calc_next_run_time_func=None,
):
    if calc_next_run_time_func is None:
        calc_next_run_time_func = _calc_next_run_time

    return {
        "run_status": run_status,
        "last_run_time": now,
        "next_run_time": calc_next_run_time_func(canvas_row.schedule_config),
    }


def is_stale_running_schedule(
    canvas_row,
    *,
    now,
    stale_after_seconds=AGENT_SCHEDULE_STALE_SECONDS,
):
    return (
        getattr(canvas_row, "run_status", None) == "running"
        and bool(getattr(canvas_row, "next_run_time", None))
        and canvas_row.next_run_time <= now - stale_after_seconds
    )
