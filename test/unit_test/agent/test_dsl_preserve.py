from agent.dsl_preserve import merge_preserved_agent_fields


def test_merge_keeps_agent_prompt_tools_and_subagent_nodes():
    old = {
        "components": {
            "begin": {"obj": {"component_name": "Begin", "params": {"mode": "task", "prologue": "绑定后运行"}}},
            "Agent:WeeklySynthesizer": {
                "obj": {
                    "component_name": "Agent",
                    "params": {
                        "sys_prompt": "你是周报主编",
                        "prompts": [{"role": "user", "content": "日报原文：{Seafile:DailyFetch@formalized_content}"}],
                        "tools": [{"id": "Agent:ThemeAnalyst"}],
                        "outputs": {"content": {"type": "string", "value": ""}},
                    },
                }
            },
        },
        "graph": {
            "nodes": [
                {"id": "begin", "data": {"label": "Begin", "form": {"mode": "task", "prologue": "绑定后运行"}}},
                {
                    "id": "Agent:WeeklySynthesizer",
                    "data": {
                        "label": "Agent",
                        "form": {
                            "sys_prompt": "你是周报主编",
                            "prompts": [{"role": "user", "content": "日报原文：{Seafile:DailyFetch@formalized_content}"}],
                            "tools": [],
                        },
                    },
                },
                {"id": "Agent:ThemeAnalyst", "data": {"label": "Agent", "form": {"sys_prompt": "主题"}}},
            ],
            "edges": [
                {
                    "source": "Agent:WeeklySynthesizer",
                    "target": "Agent:ThemeAnalyst",
                    "sourceHandle": "agentBottom",
                    "targetHandle": "agentTop",
                }
            ],
        },
    }
    new = {
        "components": {
            "begin": {"obj": {"component_name": "Begin", "params": {"mode": "conversational", "prologue": "你好"}}},
            "Agent:WeeklySynthesizer": {
                "obj": {
                    "component_name": "Agent",
                    "params": {
                        "sys_prompt": "flow.sysPromptDefaultValue",
                        "prompts": [{"role": "user", "content": ""}],
                        "tools": [],
                    },
                }
            },
        },
        "graph": {
            "nodes": [
                {"id": "begin", "data": {"label": "Begin", "form": {"mode": "conversational", "prologue": "你好"}}},
                {
                    "id": "Agent:WeeklySynthesizer",
                    "data": {
                        "label": "Agent",
                        "form": {"sys_prompt": "flow.sysPromptDefaultValue", "prompts": [{"role": "user", "content": ""}]},
                    },
                },
            ],
            "edges": [],
        },
    }

    merged = merge_preserved_agent_fields(new, old)
    ws = merged["components"]["Agent:WeeklySynthesizer"]["obj"]["params"]
    assert "日报原文" in ws["prompts"][0]["content"]
    assert ws["sys_prompt"] == "你是周报主编"
    assert ws["tools"][0]["id"] == "Agent:ThemeAnalyst"
    assert merged["components"]["begin"]["obj"]["params"]["mode"] == "task"
    ids = [n["id"] for n in merged["graph"]["nodes"]]
    assert "Agent:ThemeAnalyst" in ids
    assert any(e.get("target") == "Agent:ThemeAnalyst" for e in merged["graph"]["edges"])
