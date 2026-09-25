# 搜索应用对话模型（chat_id）

状态：已在 `智盛fontend/` 实施（2026-09-25）。Python 后端接口未改。

创建和编辑搜索应用时必须选择对话模型，并写入 `search_config.chat_id`。取值是 `GET /api/v1/models` 的 `model_id`；没有 `model_id` 时使用 `name@instance@provider`。`model_list` 同时返回对话模型列表和租户默认对话模型 id。默认模型来自 `GET /api/v1/models/default` 里 `model_type` 为 `chat` 的项，不使用列表中的第一项。

已有应用在检索或生成思维导图时，如果 `chat_id` 为空，用租户默认对话模型补齐。补齐前会再读一次详情，避免覆盖这段时间里刚保存的模型。补齐失败只记日志，检索继续。模型鉴权失败时，页面提示检查模型配置。

租户默认对话模型本身鉴权失败时，搜索会把该模型写进尚未配置的应用。需要先修复该 provider 的 API Key，或在应用设置里改选其他对话模型。

未纳入本次修改：门户空账号校验、按用户 id 删除账号，以及清理探针应用和会话。
