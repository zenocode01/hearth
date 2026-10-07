---
name: chat-streaming
description: 'Use for the chat page, streaming replies (Vercel AI SDK streamText / SSE), markdown rendering, and message data structure. Blueprint L1-1, roadmap phase 1.'
---

# 聊天 + 流式回复（L1-1）

第一个就该做的功能：输入框 + 消息列表 + **逐字**渲染。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/src/features/Chat/` —— 消息结构、输入框、消息列表的组织方式
- `refs/lobe-chat/packages/fetch-sse/` —— SSE 收流思想（我们用 Vercel AI SDK 替代）
- `refs/lobe-chat/.agents/skills/data-fetching-architecture/SKILL.md` —— 数据获取分层思想
- `refs/lobe-chat/.agents/skills/ux/SKILL.md` —— 空/加载/错误三态规范

## 简化版做法

1. `app/(chat)/page.tsx`：顶部 Agent 名 + 中间消息列表 + 底部输入框（页面薄，逻辑进 `features/chat/`）。
2. `app/api/chat/route.ts`：Vercel AI SDK `streamText`；model 与 key 来自 `lib/llm/`（见 `model-providers`）。
3. 前端逐字渲染：优先 AI SDK 的 `useChat`，或自消费 SSE。**禁止整段等待后一次性渲染**。
4. Markdown：react-markdown + shiki（代码块带复制按钮）。
5. 消息数据结构（参考 LobeHub messages 表，只留需要的列）：`id / topicId / role / content / createdAt`。

## 必须有的状态

- 发送中：输入框禁用 + 防重复提交（或停止按钮）
- 失败：断网 / 错 key 时**可读的错误提示**（验收项，不是可选项）
- 空会话：首个引导提示语

## 验收（`docs/replica/04` 阶段 1）

- [ ] 问"1+1 等于几"能看到逐字打字效果
- [ ] Markdown 标题/列表/代码块排版正确，代码有高亮和复制按钮
- [ ] 断网或写错 key 时有可读错误提示

## 常见翻车

- 回答一次性出现 → 没走流式接口，检查是否真的用了 `streamText` 并消费了 stream。
- 刷新后消息还在 → 说明提前接了持久化；那是阶段 2 的活，先确认当前阶段范围。
