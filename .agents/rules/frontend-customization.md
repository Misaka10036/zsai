# Frontend Customization Rules

This project has local frontend customization requirements. Future frontend
changes should preserve the following behavior unless the user explicitly asks
to change it.

## Branding

- User-facing product name should be `智盛AI检索平台`.
- Do not reintroduce user-facing `RAGFlow` text in frontend pages, dialogs,
  embeds, browser metadata, package display fields, or locale strings.
- Internal code identifiers may keep existing names when renaming them would
  cause unnecessary churn, for example component names such as
  `RAGFlowAvatar`.
- Header/help links should point to zsre-facing destinations when present.
- GitHub and Discord links should stay removed from the frontend header and
  other primary navigation surfaces.

## User Settings Visibility

The user-setting page should only expose the retained settings entries.

- Hide these user-setting sidebar entries:
  - Data Source
  - Chat Channel
  - MCP
  - API
- `/user-setting` should default to the model settings page.
- Direct visits to hidden user-setting main routes should redirect back to the
  model settings page:
  - `/user-setting/data-source`
  - `/user-setting/chat-channel`
  - `/user-setting/mcp`
  - `/user-setting/api`
- Keep the data-source detail route available if it is needed by dataset
  configuration workflows.

## Language

- The frontend UI language is fixed to Simplified Chinese.
- Default language code is `zh-Hans`.
- Supported UI language list should contain only Simplified Chinese.
- Existing stored language values such as `en` should be normalized to
  `zh-Hans`.
- Language selectors in the header and embed/share dialogs should show only
  Simplified Chinese.
- Dataset/document language settings are content-processing settings and should
  not be treated as UI language selectors unless the user asks for that.

## Model Providers

The model provider page should hide non-preferred providers. The visible
provider allowlist is the source of truth and currently contains only:

- `Tongyi-Qianwen`
- `Moonshot`
- `ZHIPU-AI`
- `LLMFactory.WenXinYiYan` (`WenXinYiYan`)
- `Ollama`
- `DeepSeek`
- `VolcEngine`
- `MiniMax`
- `Tencent Hunyuan`
- `XunFei Spark`
- `BaiduYiyan`
- `Tencent Cloud`
- `Youdao`
- `BAAI`

Providers not in the allowlist should be hidden from:

- Available provider cards
- Added provider cards
- System default model dropdowns
- Indirect add-provider entry points

The following providers were explicitly hidden and should not be reintroduced
without user approval:

- `302.AI`
- `BaiChuan`
- `GiteeAI`
- `Jiekou.AI`
- `LongCat`
- `Meituan`
- `MinerU`
- `ModelScope`
- `PaddleOCR`
- `PPIO`
- `SILICONFLOW`
- `StepFun`
- `TokenPony`

Implementation notes:

- Keep provider visibility centralized in `VisibleModelProviderSet` and
  `isVisibleModelProvider` in `web/src/constants/llm.ts`.
- Filter provider lists returned by `useFetchAvailableProviders` and
  `useFetchAddedProviders`.
- Use provider filtering in `ModelTreeSelect` where model provider choices are
  shown.
- Keep an add-provider guard in the model provider page so hidden providers
  cannot be opened indirectly.
