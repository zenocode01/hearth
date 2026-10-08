---
name: builtin-tools
description: Use for AI tool calling / function calling in chat: tool definitions, multi-step calls, tool cards in messages, and persisting tool parts. Blueprint L2-11, roadmap phase 5.
---

# 工具调用（L2-11）

AI 能在对话中主动调用「内置工具」，结果回填给模型继续回答；聊天里显示工具卡片（LobeHub 的标志性体验）。

## 已落地结构

| 位置 | 职责 |
|---|---|
| `lib/llm/tools.ts` | 三个工具定义：`calculate`（安全表达式求值）/ `get_current_time` / `fetch_url`（抓网页去标签、截 4000 字） |
| `app/api/chat/route.ts` | `streamText({ tools: chatTools, stopWhen: stepCountIs(5) })`；落库时把片段序列化进 `messages.parts` |
| `lib/db/messageParts.ts` | `serializeParts` / `deserializeParts` / `parseStoredParts`——入库片段与 AI SDK part 的**双向映射** |
| `features/chat/ToolCard.tsx` | 工具卡片：图标 + 中文名 + 参数摘要 + 状态（调用中/已完成/失败），展开看参数与结果 |
| `features/chat/MessageItem.tsx` | **按片段顺序**渲染：reasoning → tool 卡片 → Markdown 正文（多步调用的交错顺序与真实过程一致） |

## 关键决定与坑（都踩过）

- **用 `jsonSchema()` 不用 zod**：zod 只是 `ai` 的传递依赖，项目依赖清单里没有（守则：新依赖先问用户）。`jsonSchema<T>({ type:'object', properties, required })` 一样能给 `execute` 推断出入参类型。
- **多步调用**：`stopWhen: stepCountIs(5)`（服务端自动执行全部 `execute`）；不写的话模型调用一次工具就停，不会回填结果继续生成。
- **part 类型**：静态工具是 `tool-<name>`，动态工具是 `dynamic-tool` + `toolName`；用 `isToolUIPart(part)` 收窄（它同时覆盖两种）。状态机：`input-streaming` / `input-available` / `output-available` / `output-error`（还有 approval-*，我们用不到）。
- **不要把 AI SDK 的 part 原样入库**：SDK 升级会改结构。存**自己的紧凑片段**（`{type:'text'|'reasoning'|'tool', …}`），回读时再还原成 `tool-<name>`。
- **`messages.parts` 取代"从 content+reasoning 拼"**：老数据没有该列 → 历史加载回落到 content + reasoning（不能直接当空处理）。
- **坑：`convertToModelMessages` 会对每条消息读 `message.parts.some(...)`** —— 任何一条没有 `parts` 字段的消息都会 500（`Cannot read properties of undefined (reading 'some')`）。上行历史必须条条带 `parts`。
- **坑：改了 schema 必须重启 dev**：DB 连接缓存在 `globalThis`（迁移只在打开连接时跑），不重启就报 `no such column`。
- **迁移生成**：改 `lib/db/schema.ts` → `npx drizzle-kit generate --name <有意义的名字>`（会自动写 SQL + snapshot + journal，别手工改 `_journal.json`）。

## 现在的工具集（都用"不需要 key、结果确定"的示范）

| 工具 | 参数 | 说明 |
|---|---|---|
| `calculate` | `expression` | 只允许数字与 `+ - * / % ( )`，自研递归下降解析，**不用 eval**；除 0、括号不匹配都有可读错误 |
| `get_current_time` | `timezone?` | IANA 时区，默认本机时区；坏时区报错 |
| `fetch_url` | `url` | 只允许 http/https，`AbortSignal.timeout(10s)`，去 script/style/标签后截 4000 字 |

> 本机的本地模型（qwen3.8-27b，OpenAI 兼容接口）**支持 tool calling**，实测能正确选工具、读结果、再用自然语言回答。

## 验证套路（本次用过的）

1. 建临时话題 → POST `/api/chat`，提示词要明确诱导（"用计算器算 (23*17+9)/4"）；SSE 里能看到 `tool-input-*` / `tool-output-*` 事件。
2. GET `/api/topics/<id>` 检查 `messages.parts` 里有没有 `{type:'tool', toolName, state:'output-available', output}`。
3. **第二轮带上完整历史**（从库里读回并还原片段）——这才是"历史里有工具片段"的真实验证（模型要能在带工具历史的上下文中继续）。
4. 浏览器：卡片文案（中文名/状态/参数摘要）+ 展开看参数与结果；**整页刷新后卡片仍在**（验证持久化）。
5. 测试脚本别把 body 二次 `JSON.stringify`（会变成 `{"body":"…"}`，路由报 `messages` 缺失——本次踩过，排查了半小时）。

## 下一步可扩

- 更多工具（网页摘要需要搜索 API、天气需要 key——按需再加）
- MCP 接入（L2-12）：把 MCP server 的工具转成 `dynamicTool`，UI 用 `dynamic-tool` 分支渲染（ToolCard 已支持）
- 工具的开关/权限（哪个 Agent 能用哪些工具）：`agents` 表加一列 JSON 白名单 + `tools` 只传启用的
