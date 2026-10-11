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
- **主题控件在顶栏**（`components/ThemeControls.tsx`）：聊天页放 header，不悬浮、不遮挡内容；主题状态经 `components/themeContext.ts` 共享。

## 滚动体验（已落地）

- **滚动条**：消息容器加 `.hearth-scroll` 类（`app/globals.css`）——`scrollbar-width: thin` + `::-webkit-scrollbar` 规则，用 `--ant-color-fill` 跟随主题（Windows 默认滚动条又粗又不随主题）。
- **回到最新按钮**：`features/chat/BackBottom.tsx`，绝对定位在消息区右下（不随滚动移动），仅 `!atBottom` 时淡入可点。
- **自动跟随策略（重要）**：只有用户**本来就在底部**（距底 < 32px）时才跟随新内容；上翻阅读时绝不强行拽回，改为亮出"回到最新"按钮。自己发消息时则强制回到底部。
- 用 `atBottomRef` 记录位置、`useEffect` 只依赖 `messages`：否则平滑滚动产生的 scroll 事件会触发 effect 反过来打断滚动。

## 输入区能力（composer，学 refs 的 ChatInput）

`ChatComposer.tsx` 是纯文本框 + 自绘弹层（没有 `@lobehub/editor` 的富文本标签），当前有四项：

| 能力 | 触发 | 实现要点 |
|---|---|---|
| 斜杠命令 | 输入以 `/` 开头且还没空格 | 行首匹配 `^\/(\w*)$`；`/new`、`/compact` |
| **`@` 提及** | 光标前有 `@`（`@` 前必须是行首/空白，`@` 到光标之间不能有空白 → 邮箱、`a@b` 不算） | 受控 textarea 拿不到光标，**自己用 `onChange/onClick/onKeyUp/onSelect` 记 `caret`**；候选按类别分组（Agent / 会话 / 文件），`↑/↓` 选项、`Enter` 选中、`Esc` 关掉（关掉后要 `mentionSuppressed`，否则下一次渲染又弹） |
| 输入历史 | 空输入或光标在行首时 `↑` / `↓` | 发送过的输入，浏览位置 `-1` = 不在浏览 |
| 草稿持久化 | 自动 | 按会话存 `localStorage`（`hearth-draft:<topicId\|new>`），保存 effect 声明在载入 effect **之前**（切会话时不把旧草稿写进新会话） |

文件：`features/chat/mention.ts`（**纯逻辑**：`detectMention` / `applyMention` / `filterMentionGroups` / `extractTopicRefs`）、`features/chat/MentionMenu.tsx`（分组菜单）、`ChatComposer.tsx`（光标跟踪 + 键盘）。

### `@` 提及的三类语义（对标 LobeHub 的 agent / topic / file mention）

- **Agent 类 = 动作，不插文本**：选中即 `handleAgentChange(agentId)`（PATCH `topics.agentId`，人设立即生效）+ toast。输入框里那段 `@查询词` 会被**抹掉**（`applyMention` 不传 `insert`）。
- **会话类 = 引用，插文本**：往输入框插 `@<会话标题> `。**引用不在前端存状态**：发送时用 `extractTopicRefs(draft, topics, { excludeTopicId })` 从文本里现认（`@` 必须在行首/空白之后、后面正好跟某个会话标题），作为 `references: [{id, type:'topic'}]` 进请求体。
  - 为什么不存状态：token 就是普通文本，用户会删、切会话时草稿又从 `localStorage` 恢复——存一份引用状态必然和文本对不上（踩过：切走再切回，token 还在但引用失效）。现认之后刷新、切会话、**手打 `@标题`** 三种路径行为一致；代价是两个会话标题一样时会同时引用上。
  - 输入框上方有一条 `referenceHint`（「将引用会话：X、Y」），让"这段 token 现在算不算引用"可见——验收时看它最省事。
- **文件类 = 动作，不插文本**：选中即 `attachments.addExisting([file])`（**URL 复用、不重传**），候选来自 `GET /api/files`（`lib/files/library.ts` 从消息片段汇总"用过的附件"）——回填路径与消息的"放回输入框"同一条，详见 `attachments-multimodal` skill。
- 服务端（`lib/llm/references.ts`）：`parseTopicReferences` 校验 → `buildTopicReferences` 读被引用会话最近 20 条（单段 ≤2000 字、合计 ≤6000 字，超了砍头留尾并注明「前文略」）→ 拼成 `用户引用了其他会话的内容…` + `<referenced_topic title="…">` 块。
- **注入点**：内置模型分支用 `withReferences(context.messages, block)` 拼进**最后一条 user 消息**（`withReferences` 返回新数组，落库的仍是用户原文）；CLI 分支拼在 `question` 前面（pi 的 session 模式同样只发这一轮）。
- **与附件同一套取舍**：只有**当前轮**把引用内容发给模型，历史里只剩输入框那句 `@标题`；引用块不计入压缩的 token 预算（很小，先不折腾）。

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

- 当前接入的是**推理模型**（`qwen3.8-27b`）：正文前有若干秒思考时间，`completion_tokens_details.reasoning_tokens` 不为 0。

### 推理模型必须处理"思考"（否则看起来像卡住）

- **字段**：上游把推理放在 `delta.reasoning`（非标准的 `reasoning_content`）；`@ai-sdk/openai-compatible` 两者都认（`delta.reasoning_content ?? delta.reasoning`）。`toUIMessageStream` 的 `sendReasoning` **默认 true**，所以 `message.parts` 里已经有 `{ type: 'reasoning', text }`。
- **必须做的两件事**：
  1. **指示器**：从提交到**首条内容（含推理）**到达前，必须显示"思考中"（`waitingFirstToken = busy && 最后一条 assistant 消息没有任何 text/reasoning`）。只在 `status === 'submitted'` 时显示是不够的——进入 `streaming` 后正文可能还没来，指示器一消失就像卡死。
  2. **可折叠的推理块**（`features/chat/ReasoningBlock.tsx`，参考 refs 的 `Conversation/components/Thinking`）：
     - 思考中：**自动展开**，转圈图标 + 呼吸的"思考中…"，内容自动滚到最新；
     - 思考结束：**自动收起**为一行"已深度思考 N 秒"；
     - 点标题可**自由收缩 / 展开**。
- **时长必须从"发起请求"计时**（`ChatView` 记录 `startedAt` 传给最后一条 AI 消息），**不能从推理文本到达计时**：上游常常临近结束才批量吐出推理（实测出现过 7.5 秒才拿到推理、0.3 秒后就出正文，从文本到达算只有 0.3 秒）。
- **折叠实现用条件渲染**（`{open && ...}` + 入场动画）。实测在本项目结构下：`grid-template-rows: 0fr` 不塌缩（计算值仍是内容高度）、`max-height` 过渡会被反复重启不生效。条件渲染的收起高度绝对是 0。

## 常见翻车

- 回答一次性出现 → 没走流式接口，检查 `streamText` 与 `toUIMessageStream` 链路。
- 中文输入拼音就直接发送 → 未处理 composition 事件（见 `ChatComposer`）。
- 装 shiki/react-markdown 自己拼 → 先看 `@lobehub/ui` 的 `Markdown` 是否已满足。
- Turbopack 报 junction 错误 → 见 AGENTS.md，本机需用 `--webpack`。
