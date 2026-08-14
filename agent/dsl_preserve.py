#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You can obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""Keep Agent prompts/tools when a canvas autosave would wipe them."""

from __future__ import annotations

from typing import Any


PLACEHOLDER_SYS_PROMPT = "flow.sysPromptDefaultValue"


def prompt_text(params: dict[str, Any] | None) -> str:
    if not isinstance(params, dict):
        return ""
    prompts = params.get("prompts")
    if isinstance(prompts, str):
        return prompts.strip()
    if isinstance(prompts, list) and prompts:
        first = prompts[0] if isinstance(prompts[0], dict) else {}
        return str(first.get("content") or "").strip()
    return ""


def is_placeholder_sys_prompt(value: Any) -> bool:
    text = str(value or "").strip()
    return not text or text == PLACEHOLDER_SYS_PROMPT


def _params(component: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(component, dict):
        return {}
    obj = component.get("obj") or {}
    params = obj.get("params") if isinstance(obj, dict) else None
    return params if isinstance(params, dict) else {}


def _preserve_agent_params(new_params: dict[str, Any], old_params: dict[str, Any]) -> None:
    if not prompt_text(new_params) and prompt_text(old_params):
        new_params["prompts"] = old_params.get("prompts")
    if is_placeholder_sys_prompt(new_params.get("sys_prompt")) and not is_placeholder_sys_prompt(
        old_params.get("sys_prompt")
    ):
        new_params["sys_prompt"] = old_params.get("sys_prompt")
    if not (new_params.get("tools") or []) and (old_params.get("tools") or []):
        new_params["tools"] = old_params.get("tools")
    if not new_params.get("outputs") and old_params.get("outputs"):
        new_params["outputs"] = old_params.get("outputs")


def _preserve_begin_params(new_params: dict[str, Any], old_params: dict[str, Any]) -> None:
    if new_params.get("mode") == "conversational" and old_params.get("mode") == "task":
        new_params["mode"] = "task"
        if old_params.get("prologue"):
            new_params["prologue"] = old_params.get("prologue")


def _preserve_graph(new_dsl: dict[str, Any], old_dsl: dict[str, Any]) -> None:
    old_graph = old_dsl.get("graph") if isinstance(old_dsl.get("graph"), dict) else {}
    new_graph = new_dsl.setdefault("graph", {})
    if not isinstance(new_graph, dict):
        return
    old_nodes = [n for n in (old_graph.get("nodes") or []) if isinstance(n, dict) and n.get("id")]
    new_nodes = [n for n in (new_graph.get("nodes") or []) if isinstance(n, dict)]
    new_ids = {n.get("id") for n in new_nodes}
    for node in old_nodes:
        nid = node.get("id")
        if nid in new_ids:
            continue
        if isinstance(nid, str) and (nid.startswith("Agent:") or nid.startswith("Tool:")):
            new_nodes.append(node)
    new_graph["nodes"] = new_nodes

    old_node_map = {n.get("id"): n for n in old_nodes}
    for node in new_nodes:
        old = old_node_map.get(node.get("id"))
        if not old:
            continue
        new_form = ((node.get("data") or {}).get("form")) or {}
        old_form = ((old.get("data") or {}).get("form")) or {}
        if not isinstance(new_form, dict) or not isinstance(old_form, dict):
            continue
        label = ((node.get("data") or {}).get("label")) or ""
        if node.get("id") == "begin" or label == "Begin":
            _preserve_begin_params(new_form, old_form)
        elif label == "Agent" or str(node.get("id") or "").startswith("Agent:"):
            _preserve_agent_params(new_form, old_form)

    old_edges = [e for e in (old_graph.get("edges") or []) if isinstance(e, dict)]
    new_edges = [e for e in (new_graph.get("edges") or []) if isinstance(e, dict)]
    existing = {(e.get("source"), e.get("target"), e.get("sourceHandle"), e.get("targetHandle")) for e in new_edges}
    for edge in old_edges:
        key = (edge.get("source"), edge.get("target"), edge.get("sourceHandle"), edge.get("targetHandle"))
        if key not in existing:
            new_edges.append(edge)
    new_graph["edges"] = new_edges


def merge_preserved_agent_fields(new_dsl: Any, old_dsl: Any) -> Any:
    if not isinstance(new_dsl, dict) or not isinstance(old_dsl, dict):
        return new_dsl
    new_comps = new_dsl.get("components")
    old_comps = old_dsl.get("components")
    if isinstance(new_comps, dict) and isinstance(old_comps, dict):
        for cid, new_comp in new_comps.items():
            old_comp = old_comps.get(cid)
            if not isinstance(new_comp, dict) or not isinstance(old_comp, dict):
                continue
            new_params = _params(new_comp)
            old_params = _params(old_comp)
            name = ((new_comp.get("obj") or {}).get("component_name")) or ""
            if cid == "begin" or name == "Begin":
                _preserve_begin_params(new_params, old_params)
            elif name == "Agent":
                _preserve_agent_params(new_params, old_params)
    _preserve_graph(new_dsl, old_dsl)
    return new_dsl
