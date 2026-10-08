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

## 工具列表与开关（参考 refs 的 ChatInput/ActionBar/Tools）

| 位置 | 职责 |
|---|---|
| `features/chat/ToolPicker.tsx` | 输入框操作栏左侧的「工具 N/M」入口 → Popover（宽 320）：按 **已启用 / 已禁用** 分组，每行一个 Switch；打开面板时若目录为空会补拉一次 |
| `lib/tools/settings.ts` | **纯逻辑**（不 import `ai`）：`ToolSetting` / `parseToolSettings` / `enabledToolNames`——客户端与服务端共用 |
| `app/api/tools/route.ts` | 把 `TOOL_CATALOG` 给前端（**不能让客户端 import `lib/llm/tools.ts`**，那会把 `ai` 打进浏览器包） |
| `topics.tools`（JSON） | 会话级的开关：`[{ name, mode: 'auto' | 'disabled' }]`；**不在列表里 = auto**（LobeHub pluginConfig 的思路），全 auto 时归一成 `null` |
| `resolveChatTools(enabledToolNames(settings, names))` | 服务端按开关筛选；`null` = 全部，`[]` = 一个不给（`tools: undefined`） |

- **为什么存在会话上**：LobeHub 存 Agent 级（`agents.plugins`）+ 会话回退；我们的默认聊天没有 Agent，会话级更直接（也对应 LobeHub 的会话配置回退）。将来要 Agent 级默认，解析顺序改成 `topic.tools ?? agent.tools ?? null` 即可。
- 目录与工具定义**同一来源**（`TOOL_CATALOG` 从 `chatTools` 的定义里读 label/description/参数），避免两处漂移。
- 新会话的开关先记在客户端，建 topic 时带上（与 agentId 同一套路）。

## pi 自带的工具（外部 CLI 运行时）

Agent 走**外部 CLI = pi** 时，工具是 pi 自己的（Hearth 的内置工具与它无关），所以列表要显示 **pi 的工具**：

- **清单来源**：pi 官方文档 `docs/settings.md#tools`（随包安装：`node_modules/@earendil-works/pi-coding-agent/docs/`）——
  内置 = `read` / `bash` / `powershell`（仅 Windows）/ `edit` / `write` / `grep` / `find` / `ls`；
  `defaultTools` 默认 = `read`, `bash`, `edit`, `write`。
- **启用状态是实时读的**：`~/.pi/agent/settings.json` 的 `defaultTools`（读不到就按默认 4 个）。
- **实现**：`lib/llm/piTools.ts`（`isPiCommand` 去掉 `KEY=value` 前缀后看第一个 token；`listPiTools` 读 settings）。
- **API**：`GET /api/tools?agentId=` 按运行时返回三种：
  | runtime | 含义 | UI |
  |---|---|---|
  | `builtin` | Hearth 内置工具 | 可开关（随会话保存） |
  | `pi` | pi 自带工具 | 只读：`已启用/未启用` 标签 + 说明 + settings 路径 |
  | `external` | 其它 CLI（opencode 等） | 空清单 + 「工具由它自己管理」说明 |
- **pi 侧怎么改**：`~/.pi/agent/settings.json` 的 `defaultTools`，或命令模板里加 `--tools` / `--exclude-tools` / `--no-builtin-tools`（pi 支持这些参数，我们没代改）。
- **清单会过期**：pi 升级新增工具时 `PI_BUILTIN_TOOLS` 要跟着更新（未知工具仍会原样展示，不会丢）。

## 关键决定与坑（都踩过）

- **用 `jsonSchema()` 不用 zod**：zod 只是 `ai` 的传递依赖，项目依赖清单里没有（守则：新依赖先问用户）。`jsonSchema<T>({ type:'object', properties, required })` 一样能给 `execute` 推断出入参类型。
- **多步调用**：`stopWhen: stepCountIs(5)`（服务端自动执行全部 `execute`）；不写的话模型调用一次工具就停，不会回填结果继续生成。
- **part 类型**：静态工具是 `tool-<name>`，动态工具是 `dynamic-tool` + `toolName`；用 `isToolUIPart(part)` 收窄（它同时覆盖两种）。状态机：`input-streaming` / `input-available` / `output-available` / `output-error`（还有 approval-*，我们用不到）。
- **不要把 AI SDK 的 part 原样入库**：SDK 升级会改结构。存**自己的紧凑片段**（`{type:'text'|'reasoning'|'tool', …}`），回读时再还原成 `tool-<name>`。
- **`messages.parts` 取代"从 content+reasoning 拼"**：老数据没有该列 → 历史加载回落到 content + reasoning（不能直接当空处理）。
- **坑：`convertToModelMessages` 会对每条消息读 `message.parts.some(...)`** —— 任何一条没有 `parts` 字段的消息都会 500（`Cannot read properties of undefined (reading 'some')`）。上行历史必须条条带 `parts`。
- **坑：`humanizeError` 别用裸 `fetch` 当网络关键词**：工具报错消息里会列出可用工具（含 `fetch_url`），一匹配就误报成"无法连接模型服务"。要先用 `NoSuchToolError.isInstance` / `InvalidToolInputError.isInstance` 分类，网络判断只留 `fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|socket hang up` 这类具体模式。
- **弱模型会幻觉工具名**：qwen 偶尔先调 `<名字>_function`（provider 风格的误写），SDK 报"不存在的工具" → UI 显示一张**失败卡片**，模型随即自己改用正确工具重试（同一轮里两张卡片）。属正常现象，不用拦。
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
