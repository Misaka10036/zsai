import pytest

from agent.component.llm import LLM, LLMParam


def _llm(prompts=None):
    cpn = LLM.__new__(LLM)
    cpn._param = LLMParam()
    cpn._param.prompts = prompts or [{"role": "user", "content": "User query: {sys.query}"}]
    return cpn


@pytest.mark.p1
def test_sys_prompt_and_msg_fills_empty_user_from_query_and_upstream():
    cpn = _llm([{"role": "user", "content": ""}])

    class Upstream:
        def output(self, key):
            return "张三日报正文" if key == "formalized_content" else ""

    class Canvas:
        def get_variable_value(self, _key):
            return "生成本周周报"

        def get_component(self, _cid):
            return {"upstream": ["Seafile:DailyFetch"]}

        def get_component_obj(self, _cid):
            return Upstream()

    cpn._canvas = Canvas()
    cpn._id = "Agent:WeeklySynthesizer"
    msg, _ = cpn._sys_prompt_and_msg([{"role": "user", "content": ""}], {})
    assert "生成本周周报" in msg[-1]["content"]
    assert "张三日报正文" in msg[-1]["content"]


@pytest.mark.p1
def test_sys_prompt_and_msg_replaces_trailing_user_instead_of_skipping():
    cpn = _llm()
    msg, _ = cpn._sys_prompt_and_msg([{"role": "user", "content": ""}], {"sys.query": "test"})
    assert msg == [{"role": "user", "content": "User query: test"}]


@pytest.mark.p1
def test_sys_prompt_and_msg_keeps_consecutive_configured_prompts():
    cpn = _llm(
        [
            {"role": "user", "content": "Context: {sys.query}"},
            {"role": "user", "content": "User query: {sys.query}"},
        ]
    )
    msg, _ = cpn._sys_prompt_and_msg([], {"sys.query": "test"})
    assert msg == [
        {"role": "user", "content": "Context: test"},
        {"role": "user", "content": "User query: test"},
    ]


@pytest.mark.p1
def test_validate_fitted_messages_requires_trailing_user():
    err = LLM.validate_fitted_messages(
        [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "still here"},
            {"role": "assistant", "content": "reply"},
        ]
    )
    assert err and "empty" in err.lower()


@pytest.mark.p1
def test_validate_fitted_messages_rejects_empty_user():
    err = LLM.validate_fitted_messages([{"role": "system", "content": "system"}, {"role": "user", "content": ""}])
    assert err and "empty" in err.lower()


@pytest.mark.p1
def test_fit_messages_empty_original_user_is_not_a_max_tokens_error():
    msg_fit, err = LLM.fit_messages("system", [{"role": "user", "content": ""}], 8192)
    assert err
    assert "blank" in err.lower() or "empty" in err.lower()
    assert "max_tokens" not in err.lower()


def test_fit_messages_uses_default_context_when_max_length_zero():
    msg_fit, err = LLM.fit_messages(
        "s" * 845,
        [{"role": "user", "content": "User query: test"}],
        0,
    )
    assert err is None
    assert msg_fit[-1]["content"] == "User query: test"


@pytest.mark.p1
def test_gen_conf_includes_zero_temperature_when_enabled():
    """Include an explicitly enabled zero temperature in the model configuration."""
    param = LLMParam()
    param.temperature = 0
    param.temperatureEnabled = True

    assert param.gen_conf()["temperature"] == 0
