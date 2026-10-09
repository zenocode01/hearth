---
name: context-compaction
description: 'Use for conversation context compression / summarization: the topic_summaries table, rolling summary + waterline, token budget thresholds (contextBudget), the ContextMeter chip, manual compress / undo, and applying it to both builtin (api) and external CLI (pi) sessions. Also covers pi''s own compaction format we learned from.'
---

# 上下文压缩（会话摘要）

会话太长时，把**旧消息**压成一段**滚动摘要**，只把「摘要 + 最近几轮原文」发给模型。
**原消息不删**——UI 里历史仍完整，压缩只影响"发给模型的那份"。

内置模型（api）和外部 CLI（pi 等）**都走我们自己的压缩**（事实来源是我们的 DB；
不转发 pi 的 `compact`，那需要持久会话，会和"删除/重新生成消息"打架）。

## 已落地结构

| 层 | 位置 |
|---|---|
| 表 | `lib/db/schema.ts` 的 `topicSummaries`（迁移 `0007_topic_summaries`）：`id / topic_id / content / through_message_id / compressed_count / token_count / created_at` |
| 预算 | `lib/llm/contextBudget.ts`：`estimateTokens`（CJK≈1、其余 4 字符≈1）、`estimateMessagesTokens`（含 ×`DRIFT_MULTIPLIER` 1.2）、`decideCompression`（`COMPRESS_TOKEN_LIMIT` 默认 16000、摘要后水位 ×`RECOMPRESS_FACTOR` 1.3、`KEEP_RECENT_TURNS` 默认 6） |
| 核心 | `lib/llm/compaction.ts`：`prepareContext`（判定→摘要→返回该发的东西）、`loadTopicMessages`、`topicContextStats`、`withSummaryInstruction`、`keepRecentStart` |
| DB 助手 | `lib/db/topicSummaries.ts`：`getLatestSummary` / `listSummaries` / `insertSummary` / `deleteSummariesAfter` / `deleteLatestSummary` |
| 接口 | `app/api/topics/[id]/context/route.ts`：GET 读数、POST 手动压缩（force）、DELETE 撤销 |
| UI | `features/chat/ContextMeter.tsx`：工具栏 chip（占用条 + 摘要预览 + 立即压缩 / 撤销最近一次） |
| 接线 | `app/api/chat/route.ts`：内置分支 `prepareContext` + `withSummaryInstruction`（走 `instructions`）；CLI 分支 `prepareContext` + `buildCliPrompt({ summary })` |

## 三条设计约定（别破坏）

1. **原消息不删**：压缩只改"发给模型的 messages"，DB 不动。
2. **滚动摘要 + 水位线**：新摘要 = 旧摘要 + 未覆盖的新历史 再压一次；`throughMessageId` 是水位线，
   下次从它之后开始压。水位线指向的消息**已不在**（删过）→ 返回 0，旧摘要作废、从头重压。
3. **判定点在"调模型之前"**：不是"每 N 轮查一次"——一条超大的工具结果就能炸穿上下文。

## 摘要格式：学 pi 的 compaction 方法

`compaction.ts` 的提示词抄的是 pi 自己的 compaction（见其 bundle 的
`SUMMARIZATION_SYSTEM_PROMPT` / `SUMMARIZATION_PROMPT` / `UPDATE_SUMMARIZATION_INSTRUCTIONS`）：

- 系统提示：只输出摘要，**不要继续对话**；
- 结构化 checkpoint：`## 目标` / `## 约束与偏好` / `## 进度`（已完成/进行中/受阻）/
  `## 关键决策` / `## 下一步` / `## 关键上下文`；要求**原样保留文件路径、函数名、报错原文**；
- 滚动压缩走"更新"指令：保留已有信息、把进行中移入已完成、更新下一步；
- 注入措辞也学 pi：`此前的对话历史已压缩成以下摘要：\n<summary>…</summary>`。

## 关键坑（都踩过）

- **摘要走 `generateText`（非流式）**。用 mock 验收时注意：`scripts/mock-llm.mjs` 判定非流式要写
  `parsed.stream !== true`——**AI SDK 的 `generateText` 请求里往往不带 `stream` 字段**（undefined），
  写成 `=== false` 会漏判、仍回 SSE → `Invalid JSON response`。
- **`messages.id` 是全局主键**（不是按会话唯一）：写测试脚本时**别跨 topic 复用 id**（如 `u1..u9`），
  否则第二次插入撞 UNIQUE、被 `onConflictDoNothing` 静默跳过（表现为"用户消息没落库"）。
- **摘要只能进 `instructions`**：AI SDK v7 不允许在 `messages` 里放 system 消息。内置分支用
  `withSummaryInstruction`；CLI 分支摘要拼进 prompt（`buildCliPrompt` 的 `summary` 参数）。
- **CLI 分支的摘要模型是 `createChatModel()`**（我们自己的 provider，不是 pi 的模型）；
  没配置（`MissingLlmConfigError`）就**降级成"照旧全量发"**，压缩绝不能把对话弄挂。
- **推理模型的 `maxOutputTokens` 要给够**：`qwen3.8-27b` 这类带推理的模型，摘要的 1500 输出
  token 会被思考过程吃光 → `generateText` 的 text 为空 → "压缩失败：摘要为空"。现用 4096。
  **mock 模型不推理，离线验收发现不了**——这类"只在真模型上出现"的阈值必须真机验。
- **`prepareContext` 用请求里的 `uiMessages`**（客户端每轮带全量历史），水位线靠 `throughMessageId`
  与请求消息 id 匹配（客户端用的是 DB id）。DB 只在写摘要时用到。
- **迟滞双阈值**：有摘要时阈值是 `×1.3` 的水位——避免"刚压完又立刻压"的抖动，别把两个阈值写成一个。
- **ContextMeter 对 CLI 也显示**（早期版本 `runtime !== 'api'` 时隐藏，已去掉）。

## 怎么验收

**离线（快，验机制）**：`.env.local` 指向 mock 并调小阈值：

```
LLM_BASE_URL=http://127.0.0.1:9123/v1
LLM_MODEL=mock
CONTEXT_TOKEN_LIMIT=300
```

```bash
npm run mock:llm     # 端口 9123
npm run dev          # 另开一个
```

- 连续发 ~6 轮消息（每轮带全量历史）→ 超阈值自动压缩，摘要数 +1；
- `POST /api/topics/<id>/context` → `compacted:true, compressedCount:N`；
- `DELETE /api/topics/<id>/context` → `removed:true`，估算回退；
- 工具栏 chip 显示「上下文 N」，popover 里有摘要预览与两个按钮。

> mock 的"摘要"只是回显提示词（**看不出格式好坏，也测不出推理模型的 token 阈值**）。

**真机（验摘要质量）**：`.env.local` 指真实模型，造一段像样的对话（直接往 DB 插 `messages`
最快，不必真聊），再 `POST /context`（force）看产出的结构化 checkpoint 是否符合
「目标/约束/进度/决策/下一步/上下文」且保留了路径与报错。
