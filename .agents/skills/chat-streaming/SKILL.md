---
name: chat-streaming
description: 'Use for the chat page, streaming replies (Vercel AI SDK streamText), markdown rendering, and message data structure. Blueprint L1-1, roadmap phase 1.'
---

# 聊天 + 流式回复（L1-1）

核心已落地（见下），真实 key 验收待补。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/src/features/Chat/` —— 消息结构、输入框、消息列表的组织方式
- `refs/lobe-chat/packages/fetch-sse/` —— SSE 收流思想（我们用 Vercel AI SDK 替代）
- `refs/lobe-chat/src/components/StreamingMarkdown/` —— 流式 Markdown 的渲染方式
- `refs/lobe-chat/.agents/skills/ux/SKILL.md` —— 空/加载/错误三态规范

## 已落地（阶段 1）

文件：`lib/llm/`（配置 + provider）、`app/api/chat/route.ts`（流式接口）、`features/chat/`（视图）、`app/chat/page.tsx`（薄页面）。

- **服务端（AI SDK v7）**：`streamText({ model, messages: await convertToModelMessages(messages) })` →
  `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream, onError: humanizeError }) })`。
- **客户端（AI SDK v7）**：`useChat()`（默认打 `/api/chat`），消息是 `UIMessage`，内容在 `message.parts`
  （`part.type === 'text'`）。`sendMessage({ text })`，`status` 取 `submitted/streaming/ready/error`。
- **Markdown 用 `@lobehub/ui` 的 `Markdown`**：`<Markdown animated variant="chat">{text}</Markdown>`，
  自带流式平滑、代码块高亮与复制。**不要**再自装 react-markdown/shiki（蓝图里的家用配方在此被 lobe-ui 简化）。
- **模型配置走 env**：任何 OpenAI 兼容接口（`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`），
  `@ai-sdk/openai-compatible` 的 `createOpenAICompatible(...).chatModel(model)`，provider 不写死。
- **错误可读（验收项）**：缺配置返回可读文案；`humanizeError` 把 401/403/404/429/网络错误映射成人话。
- **输入法安全**：Enter 发送、Shift+Enter 换行，拼音组合中（composition）不触发发送。
- **主题坞在右上角**（`ThemeSwitcher`）：避免与底部输入框重叠。

## 离线联调（无需真实 key）

```bash
npm run mock:llm          # 终端 A：本地 mock（OpenAI 兼容 SSE，端口 9123）
# 终端 B：把 .env.local 切到 mock 三行（见文件内注释），npm run dev
```

## 验收（`docs/replica/04` 阶段 1）

- [x] 逐字流式渲染（mock 采样：文本长度递增；真实模型：3.6s 出正文并递增）
- [x] Markdown 排版 + 代码高亮（shiki 渲染出 150 个高亮 span + 复制按钮）
- [x] 断网 / 错 key / 缺配置有可读错误提示（含"重试"）
- [x] 真实模型（qwen3.8-27b，OpenAI 兼容）实测通过

## 模型备注

- 当前接入的是**推理模型**（`qwen3.8-27b`）：正文前有 3~5 秒思考时间，`completion_tokens_details.reasoning_tokens` 不为 0；UI 目前忽略 reasoning 部分，只渲染正文。若以后要展示"思考中"，读 `message.parts` 里的 reasoning 类型即可。

## 常见翻车

- 回答一次性出现 → 没走流式接口，检查 `streamText` 与 `toUIMessageStream` 链路。
- 中文输入拼音就直接发送 → 未处理 composition 事件（见 `ChatComposer`）。
- 装 shiki/react-markdown 自己拼 → 先看 `@lobehub/ui` 的 `Markdown` 是否已满足。
- Turbopack 报 junction 错误 → 见 AGENTS.md，本机需用 `--webpack`。
