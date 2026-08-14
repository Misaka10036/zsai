import json
from pathlib import Path


def test_canvas_template_ids_are_unique_across_agent_and_ingestion():
    root = Path(__file__).resolve().parents[3]
    files = list((root / "agent" / "templates").glob("*.json"))
    files += list((root / "internal" / "ingestion" / "pipeline" / "template").glob("*.json"))
    ids = {}
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        template_id = str(data.get("id"))
        assert template_id, f"{path} has no id"
        assert template_id not in ids, f"duplicate template id {template_id}: {ids[template_id]} and {path}"
        ids[template_id] = path
    assert "49" in ids
    assert ids["49"].name == "seafile_weekly_report.json"
    dsl = json.loads(ids["49"].read_text(encoding="utf-8"))["dsl"]
    names = {body["obj"]["component_name"] for body in dsl["components"].values()}
    assert {"Begin", "Seafile", "Agent", "DatasetWrite", "Message"} <= names
    assert "ExitLoop" not in names
    assert "CodeExec" not in names
