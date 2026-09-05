#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
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

print("Start RAGFlow server...")

import asyncio
import time

start_ts = time.time()

import os

# LiteLLM fetches a model cost map from GitHub during import unless this is set.
# The API server should not block startup on external network access.
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")

import logging
import signal
import sys
import threading
import uuid
import faulthandler

from api.apps import app
from api.db.runtime_config import RuntimeConfig
from api.db.services.document_service import DocumentService
from common.file_utils import get_project_base_directory
from common import settings
from api.db.db_models import init_database_tables as init_web_db
from api.db.init_data import init_web_data, init_superuser
from common.versions import get_ragflow_version
from common.config_utils import show_configs
from common.mcp_tool_call_conn import shutdown_all_mcp_sessions
from common.log_utils import init_root_logger
from agent.plugin import GlobalPluginManager
from rag.utils.redis_conn import RedisDistributedLock

stop_event = threading.Event()
chat_channel_thread = None

RAGFLOW_DEBUGPY_LISTEN = int(os.environ.get("RAGFLOW_DEBUGPY_LISTEN", "0"))


def update_progress():
    lock_value = str(uuid.uuid4())
    redis_lock = RedisDistributedLock("update_progress", lock_value=lock_value, timeout=60)
    logging.info(f"update_progress lock_value: {lock_value}")
    while not stop_event.is_set():
        acquired = False
        try:
            acquired = redis_lock.acquire()
            if acquired:
                DocumentService.update_progress()
        except Exception:
            logging.exception("update_progress exception")
        finally:
            if acquired:
                try:
                    redis_lock.release()
                except Exception:
                    logging.exception("update_progress exception")
            stop_event.wait(6)


def agent_schedule_loop():
    """Background thread: poll for due scheduled agents and execute them."""
    from api.db import CanvasCategory
    from api.db.services.agent_schedule_service import (
        AGENT_SCHEDULE_STALE_SECONDS,
        build_schedule_update_after_run,
        drain_scheduled_agent,
        is_stale_running_schedule,
    )
    from api.db.services.canvas_service import UserCanvasService

    while not stop_event.is_set():
        try:
            now = int(time.time())
            not_running = UserCanvasService.model.run_status != "running"
            stale_running = (
                (UserCanvasService.model.run_status == "running")
                & (UserCanvasService.model.next_run_time <= now - AGENT_SCHEDULE_STALE_SECONDS)
            )
            due = list(
                UserCanvasService.model.select().where(
                    UserCanvasService.model.auto_run == True,  # noqa: E712
                    UserCanvasService.model.next_run_time <= now,
                    not_running | stale_running,
                    UserCanvasService.model.canvas_category == CanvasCategory.Agent,
                )
            )
            for canvas_row in due:
                lock = None
                try:
                    if is_stale_running_schedule(canvas_row, now=now):
                        logging.warning(
                            "Recovering stale scheduled agent run: agent_id=%s next_run_time=%s",
                            canvas_row.id,
                            canvas_row.next_run_time,
                        )

                    lock = RedisDistributedLock(
                        f"agent_schedule:{canvas_row.id}",
                        lock_value=str(uuid.uuid4()),
                        timeout=300,
                    )
                    if not lock.acquire():
                        continue

                    UserCanvasService.model.update(
                        run_status="running",
                    ).where(UserCanvasService.model.id == canvas_row.id).execute()

                    asyncio.run(
                        drain_scheduled_agent(canvas_row, stop_event=stop_event)
                    )
                    update_fields = build_schedule_update_after_run(
                        canvas_row,
                        now=now,
                        run_status="scheduled",
                    )
                    UserCanvasService.model.update(
                        **update_fields,
                    ).where(UserCanvasService.model.id == canvas_row.id).execute()

                    logging.info(
                        "Agent %s scheduled run completed, next at %s",
                        canvas_row.id,
                        update_fields["next_run_time"],
                    )
                except Exception as exc:
                    logging.error(f"Agent schedule run failed for {canvas_row.id}: {exc}")
                    try:
                        update_fields = build_schedule_update_after_run(
                            canvas_row,
                            now=now,
                            run_status="error",
                        )
                        UserCanvasService.model.update(
                            **update_fields,
                        ).where(UserCanvasService.model.id == canvas_row.id).execute()
                    except Exception:
                        pass
                finally:
                    if lock:
                        try:
                            lock.release()
                        except Exception:
                            pass
        except Exception as exc:
            logging.error(f"Agent schedule loop error: {exc}")

        stop_event.wait(30)

def stop_background_services():
    stop_event.set()
    if chat_channel_thread and chat_channel_thread.is_alive() and chat_channel_thread is not threading.current_thread():
        chat_channel_thread.join(timeout=5)


def signal_handler(sig, frame):
    logging.info("Received interrupt signal, shutting down...")
    shutdown_all_mcp_sessions()
    stop_background_services()
    sys.exit(0)


if __name__ == "__main__":
    faulthandler.enable()
    init_root_logger("ragflow_server")
    logging.info(r"""
        ____   ___    ______ ______ __
       / __ \ /   |  / ____// ____// /____  _      __
      / /_/ // /| | / / __ / /_   / // __ \| | /| / /
     / _, _// ___ |/ /_/ // __/  / // /_/ /| |/ |/ /
    /_/ |_|/_/  |_|\____//_/    /_/ \____/ |__/|__/

    """)
    logging.info(f"RAGFlow version: {get_ragflow_version()}")
    logging.info(f"project base: {get_project_base_directory()}")
    show_configs()
    settings.init_settings()
    settings.print_rag_settings()

    if RAGFLOW_DEBUGPY_LISTEN > 0:
        logging.info(f"debugpy listen on {RAGFLOW_DEBUGPY_LISTEN}")
        import debugpy

        debugpy.listen(("0.0.0.0", RAGFLOW_DEBUGPY_LISTEN))

    # init db
    init_web_db()
    init_web_data()
    # init runtime config
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default=False, help="RAGFlow version", action="store_true")
    parser.add_argument("--debug", default=False, help="debug mode", action="store_true")
    parser.add_argument("--init-superuser", default=False, help="init superuser", action="store_true")
    args = parser.parse_args()
    if args.version:
        print(get_ragflow_version())
        sys.exit(0)

    if args.init_superuser:
        init_superuser()
    RuntimeConfig.DEBUG = args.debug
    if RuntimeConfig.DEBUG:
        logging.info("run on debug mode")

    RuntimeConfig.init_env()
    RuntimeConfig.init_config(JOB_SERVER_HOST=settings.HOST_IP, HTTP_PORT=settings.HOST_PORT)

    GlobalPluginManager.load_plugins()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    def delayed_start_update_progress():
        logging.info("Starting update_progress thread (delayed)")
        t = threading.Thread(target=update_progress, daemon=True)
        t.start()

    def delayed_start_agent_schedule():
        logging.info("Starting agent_schedule_loop thread (delayed)")
        t = threading.Thread(target=agent_schedule_loop, daemon=True)
        t.start()

    def start_chat_channels():
        global chat_channel_thread
        try:
            from api.channels.bootstrap import start_channel_server

            logging.info("Starting chat channel server thread")
            chat_channel_thread = threading.Thread(
                target=start_channel_server,
                args=(stop_event,),
                daemon=True,
                name="chat-channels",
            )
            chat_channel_thread.start()
        except Exception:
            logging.exception("Failed to start chat channel server")

    if RuntimeConfig.DEBUG:
        if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
            threading.Timer(1.0, delayed_start_update_progress).start()
            threading.Timer(2.0, delayed_start_agent_schedule).start()
            start_chat_channels()
    else:
        threading.Timer(1.0, delayed_start_update_progress).start()
        threading.Timer(2.0, delayed_start_agent_schedule).start()
        start_chat_channels()

    # start http server
    try:
        logging.info(f"RAGFlow server is ready after {time.time() - start_ts}s initialization.")
        app.run(host=settings.HOST_IP, port=settings.HOST_PORT, use_reloader=RuntimeConfig.DEBUG, debug=False)
    except Exception as e:
        logging.exception(f"Unhandled exception: {e}")
        stop_background_services()
        os.kill(os.getpid(), signal.SIGKILL)
    finally:
        stop_background_services()
