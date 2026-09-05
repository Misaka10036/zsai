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
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_canvas_forms_expose_daily_location_and_weekly_output():
    seafile_form = (ROOT / "web/src/pages/agent/form/seafile-form/index.tsx").read_text(encoding="utf-8")
    production_form = (ROOT / "web/src/pages/agent/form/production-data-form/index.tsx").read_text(encoding="utf-8")
    write_form = (ROOT / "web/src/pages/agent/form/dataset-write-form/index.tsx").read_text(encoding="utf-8")
    en = (ROOT / "web/src/locales/en.ts").read_text(encoding="utf-8")
    zh = (ROOT / "web/src/locales/zh.ts").read_text(encoding="utf-8")

    assert 'name="path"' in seafile_form
    assert 'name="filename_regex"' in production_form
    assert "productionDataConnector" in production_form
    assert "flow.seafilePath" in seafile_form
    assert 'name="output_format"' in write_form
    assert 'name="seafile_repo_id"' in write_form
    assert 'name="seafile_path"' in write_form
    assert "datasetWriteOutputFormat" in en
    assert "datasetWriteOutputFormat" in zh
    assert "seafilePath: 'Daily-report folder'" in en
    assert "seafilePath: '日报目录'" in zh


def test_weekly_report_template_has_location_and_format():
    template = json.loads((ROOT / "agent/templates/seafile_weekly_report.json").read_text(encoding="utf-8"))
    fetch = template["dsl"]["components"]["Seafile:DailyFetch"]["obj"]["params"]
    publish = template["dsl"]["components"]["DatasetWrite:WeeklyPublish"]["obj"]["params"]
    production = template["dsl"]["components"]["ProductionData:WeeklyFetch"]["obj"]["params"]
    assert fetch["path"] == "/日报"
    assert publish["output_format"] == "md"
    assert publish["seafile_repo_id"] == "周报"
    assert publish["seafile_path"] == "/"
    assert production["filename_regex"].endswith("sql(?:\\.gz)?$")
    assert "ProductionData:WeeklyFetch@formalized_content" in template["dsl"]["components"]["Agent:WeeklySynthesizer"]["obj"]["params"]["prompts"][0]["content"]
    graph_publish = next(node for node in template["dsl"]["graph"]["nodes"] if node["id"] == "DatasetWrite:WeeklyPublish")
    assert graph_publish["data"]["form"]["output_format"] == "md"
    assert graph_publish["data"]["form"]["seafile_repo_id"] == "周报"
    assert any(node["id"] == "ProductionData:WeeklyFetch" for node in template["dsl"]["graph"]["nodes"])


def test_compose_ships_configured_seafile_profile():
    compose = (ROOT / "docker/docker-compose-base.yml").read_text(encoding="utf-8")
    env = (ROOT / "docker/.env").read_text(encoding="utf-8")
    init = (ROOT / "docker/seafile/init-libraries.sh").read_text(encoding="utf-8")
    assert "profiles:\n      - seafile" in compose
    assert "seafileltd/seafile-mc:13.0-latest" in compose
    assert "redis:7-alpine" in compose
    assert "SEAFILE_ADMIN_EMAIL=ragflow@localhost" in env
    assert "SEAFILE_DAILY_LIBRARY=日报" in env
    assert "SEAFILE_WEEKLY_LIBRARY=周报" in env
    assert "SEAFILE_DATABASE_LIBRARY=数据库镜像" in env
    assert "SEAFILE_DATABASE_LIBRARY=${SEAFILE_DATABASE_LIBRARY:-数据库镜像}" in compose
    assert "ensure_library" in init
    assert "${SEAFILE_DAILY_LIBRARY:-日报}" in init
    assert "${SEAFILE_DATABASE_LIBRARY:-数据库镜像}" in init


def test_compose_ships_vivarly_user_frontend():
    compose = (ROOT / "docker/docker-compose.yml").read_text(encoding="utf-8")
    env = (ROOT / "docker/.env").read_text(encoding="utf-8")
    dockerfile = (ROOT / "docker/vivarly/Dockerfile").read_text(encoding="utf-8")
    config = (ROOT / "docker/vivarly/config.php").read_text(encoding="utf-8")
    login = (ROOT / "docker/vivarly/views/login.php").read_text(encoding="utf-8")
    bundle = (ROOT / "tools/scripts/build_docker_bundle.ps1").read_text(encoding="utf-8")

    assert "profiles:\n      - vivarly" in compose
    assert "0.0.0.0:${VIVARLY_PORT:-8080}:80" in compose
    assert "VIVARLY_PORT=" in env
    assert "VIVARLY_RAGFLOW_BASE_URL=http://ragflow-cpu" in env
    assert "php:8.2-apache" in dockerfile
    assert "RAGFLOW_BASE_URL" in config
    assert "vivarly_ensure_schema" in config or "schema.php" in config
    assert "doLogin" in login
    assert "/vendor/bootstrap/css/bootstrap.min.css" in login
    assert '"vivarly"' in bundle
    assert "ragflow-vivarly:" in bundle
    assert (ROOT / "docker/vivarly/vendor/bootstrap/css/bootstrap.min.css").is_file()
    assert (ROOT / "docker/vivarly/schema.php").is_file()
