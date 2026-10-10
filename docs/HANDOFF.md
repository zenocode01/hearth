# HANDOFF —— Hearth 项目交接

> 写于 2026-10-08，最后同步 2026-10-10（补 MCP / Skills / pi 会话树 / 聊天体验 LobeHub 化）。给"下一个接手的 AI/人"看：现状、这一大轮做了什么、坑在哪、下一步做什么。
> 仓库级守则见 `AGENTS.md`；人读指南见 `docs/replica/`（先读 `03 复刻蓝图`、`04 路线图`）；领域细节见 `.agents/skills/`。

## 1. 这是什么

**Hearth**：LobeHub 的**功能复刻版**（"家用配方"）——个人 AI 聊天 + Agent 工作台。
复刻原则：**挑功能，不抄代码**（`refs/` 只读参考，不参与构建、不入库）；每个功能用简化版。

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16（App Router，单项目前后端一体；**构建用 `--webpack`**） |
| 语言 | TypeScript |
| 流式 | Vercel AI SDK v7（`streamText` / `useChat`） |
| 数据库 | SQLite + Drizzle（`data/app.db`，不入库） |
| UI | `@lobehub/ui` + `@lobehub/icons`（MIT）+ antd |

规模参考（2026-10-10）：188 个跟踪文件、约 14.5k 行 TS/TSX。

## 2. 现在在哪（进度）

- **阶段 0~4 全部完成**：骨架 + 主题动画 · 流式聊天 · SQLite 持久化 · Agent 管理 · 打磨（三态/启动占位/响应式）
- **阶段 5 进行中**：✅ **L2-11 工具调用**（内置工具 + 工具卡片 + 开关）；✅ **L2-15 导出/备份**（侧栏导出 .md/.json）；✅ **L2-9 附件**（图片多模态 + 纯文本 + Office/PDF 抽文本）；✅ **MCP（L2-12）+ Agent Skills**（2026-10-10：`/mcp` 配置页 + `/skills` 只读页）；✅ **思考等级切换**（能力门 + 工具栏 chip）；✅ **提问栏对齐**（跨会话 island + 徽章 + 注册表兜底 + "全部同意"位）；🚧 **聊天体验 LobeHub 化**（2026-10-10，进行中：消息编辑 / 斜杠命令 / 输入历史 / 草稿持久化 /「过程」折叠 / 助手消息头 / 钉顶滚动 / 流式指示 / 页头标题 +「⋯」菜单 / 删除确认统一——已落地，**过程还在迭代**）；⏭️ 用户明确**跳过 L2-10 图片生成**
- **额外（超出原路线图）**：**外部 CLI Agent** 深度集成（pi / opencode / claude）：描述符目录 + 安装检测、CLI 输出统一 AgentEvent + 薄 adapter；尤其是 **pi**：
  RPC 模式、思考流、工具卡片 + 开关、todo 清单、question 对话、**上下文压缩**（会话太长把旧历史压成滚动摘要，
  内置模型与 CLI 都走我们的压缩，工具栏 chip 可看占用/手动压/撤销）、**会话树与分支**（topic ↔ pi session，历史交给 pi，按分支渲染对话，生命周期对齐）

## 3. 最近这一大轮做了什么（按主题，带 commit）

| 主题 | commit | 要点 |
|---|---|---|
| 外部 CLI Agent 基础 | `a54a6c4` `db14755` `aad5440` | 命令模板占位符/`KEY=value` 环境变量/`%VAR%` 展开、Windows shim 解析（`.cmd`→node、`.exe` 直跑）、ANSI 清理、opencode 数据目录隔离 |
| pi 思考流 | `d5d9e63` | 解析 pi 的 JSONL：`thinking_delta`→推理块、`text_delta`→正文；**不做事件白名单** |
| 内置工具调用 | `3b4802c` | `lib/llm/tools.ts`（计算器/当前时间/抓网页）+ `stopWhen` 多步 + 工具卡片 + 片段落库 `messages.parts` |
| 工具列表与开关 | `078c364` `631e72d` `321f92d` `27b783b` | 输入框 ActionBar 入口 + Popover；pi 运行时显示**pi 的工具**（内置 8 + 扩展，实时读 settings/会话）；开关随会话保存并注入 `--tools +x` / `--exclude-tools y` |
| 工具开关修复 | `9b70171` | pi 默认关的工具（powershell/grep/find/ls）开关点不动：归一成"无覆盖"后 pi 的默认"关"又赢回来 → 归一时只丢"本来就开着"的 auto |
| 图片附件 L2-9 | `ab897c3` `0fb5e2f` `ff5fb12` | `lib/files/`（uploads 服务 + **客户端安全**常量 + Office/PDF 抽文本）→ `POST /api/files`（sha1 命名落 `public/uploads`，DB 只存引用）→ `useAttachments` + `AttachmentPreview`（选文件/拖拽/粘贴、缩略图+自写灯箱）→ `sendMessage({ files })` → 路由转模型 `file` part（内置模型）/ `prompt.images`（pi）/ 文本与文档抽成 `<file name>` 块；`StoredPart` 加 file 变体、**用户消息也落 parts**（否则刷新丢图）；依赖：`fflate` + `pdfjs-dist`；踩坑与取舍见 `.agents/skills/attachments-multimodal` |
| 附件可靠性与体验 | `5f669a6` `a7d6c59` `f7bad8e` `6d61773` *（+去重本次）* | 抄 LobeChat 的四条小判定：① 超长正文给"前 4000 字预览 + 明确声明读不到"；② 非视觉模型（`LLM_VISION=0`）用显式占位符而不是静默丢图；③ 上传三态 + 进度（XHR）+ 失败重试 + 上传中禁用发送；④ 图片上传前压缩（1920px/3MB，PNG→webp）。另有"附件放回输入框"（URL 复用不重传；`addExisting` 随 ③ 那条 commit 落地）。**去重没抄它的 global_files 表**：落盘名本来就是 sha1，客户端 `HEAD /uploads/<hash>.<ext>` 探一下即可，零迁移且文件被删会自愈 |
| pi 工具卡片 | `515d474` | `toolcall_end` / `role=toolResult` → UI 工具片段；刷新后卡片保留 |
| todo UI | `a1246fe` | 工具卡片渲染 ✓/○ 清单 + 输入框上方**任务清单面板**（清单在工具结果 `details` 里，随消息持久化） |
| question UI | `36f0d1e` `bedbdf9` | **RPC 模式**运行器 + 对话协议 + 等待回答的注册表/接口 + **输入框上方的提问栏**（pending 时内联不渲染、输入框禁用） |
| 改名 & 打磨 | `5dfec42` `be49ef3` `0a9e978` `e5e8dd1` | pi-web → **Hearth**（含内部前缀迁移）；移动端响应式；三态 + 启动占位 + 路由级 loading/预取 |
| 导出/备份 L2-15 | `173e78c` | 侧栏会话行导出按钮（Popover 选 .md/.json，fetch→blob 下载 + toast）；`GET /api/topics/[id]/export` 附件下载（中文文件名 `filename*`）；`lib/export/topicExport` 纯逻辑（md 含推理 details、json 无损） |
| 提问栏对齐 | `12ec940` | 注册表 v2（`topicId/input/method` + `listPendingQuestions`）+ `GET /api/cli-runs` 轮询（`usePendingRuns` 3s）→ **跨会话 island**（`PendingIsland`：chip+Popover+条件"全部同意"）+ 侧栏 ❓ 徽章；`QuestionBar` 收数组（>1 渲染 tab）、`mergePendingQuestions` 注册表兜底（切走/刷新后重建）；**切会话 `keepStream` 不 stop 挂起流** + `streamBlocked` 不算 busy；仓外修复 `~/.pi/agent/extensions/question.ts` 放行 rpc（`ctx.ui.select`） |
| 上下文压缩 | `54b98db` `b0d6770` `add2f23` `90de601` `6d580fa` `3ec6105` | 会话太长把**旧历史压成滚动摘要**（原消息不删，只改发给模型的那份）；`topic_summaries` + 水位线 `throughMessageId`；阈值 = **模型上下文窗口的 80%**（按模型识别，见 `lib/llm/modelContext.ts`）；迟滞(压缩后 ×1.3 且不超窗口 90%)/漂移(×1.2) 见 `lib/llm/contextBudget.ts`；摘要器**学 pi 的 compaction**（结构化 checkpoint：目标/约束/进度/决策/下一步/上下文 + 滚动更新指令）；**内置模型与外部 CLI（pi）都走我们的压缩**（CLI 摘要拼进 prompt，事实来源仍是 DB）；工具栏 `ContextMeter` chip（占用条 + 摘要预览 + 立即压缩 / 撤销最近一次）。踩坑与验法见 `.agents/skills/context-compaction` |
| pi 流式修复 | `6f311e1` | pi RPC 事件要攒到整轮结束才显示：stdout 处理**只在 agent_settled/dialog 时 wake**，普通增量一直不被消费 → 每段 stdout 都 `wake()` |
| 压缩阈值按模型 | `3e2eae1` `64fee06` | 阈值改为**模型上下文窗口的 80%**：`lib/llm/modelContext.ts` 按模型识别窗口（env > pi models.json 的 `contextWindow` > 内置 `/models` 的 `max_model_len` > 兜底 32768）；压缩后水位 `min(base×1.3, 窗口×90%)` |
| 技能（Agent Skills） | `b1b8b23` `54110ed` | 本地 `data/skills/<id>/SKILL.md`：模型只看「目录」（name+描述），命中后加载正文（渐进式披露）。内置走 `activate_skill` 工具，CLI 给 SKILL.md 路径由 pi 自己 read；只读技能页 `/skills` + 侧栏入口。见 `.agents/skills/skills-and-mcp` |
| MCP（Streamable HTTP） | `98ed70d` | 依赖 `@modelcontextprotocol/sdk`；`mcp_servers` 表（迁移 0010）+ `lib/mcp/`（client 缓存+超时、工具转 AI SDK tool，名字 `mcp__<server>__<tool>`）；内置分支并进 tools；配置页 `/mcp` + 侧栏入口。见 `.agents/skills/skills-and-mcp` |
| 外部 CLI 描述符目录 + AgentEvent | `7ab14f0` `b0811c1` `40b69a1` | 学 LobeHub 异构接入：pi / opencode / claude 描述符目录 + 安装检测（`lib/llm/heteroAgents.ts` / `cliDetect.ts`）；所有外部 CLI 输出统一 AgentEvent + 薄 adapter（`lib/llm/agentEvents.ts` / `adapters.ts`） |
| pi 会话树与分支（S3~S6） | `d8cc6ce` `d4a0d00` `67f6c39` `34fd3d1` `5577a54` `0beb51e` | 持久化：topic ↔ pi session，历史交给 pi（重载从 pi 拉）→ S3：会话树面板 + 同 topic 内分支（会话客户端 + `navigateTree` 扩展 + 树/导航接口）→ S4：pi 主题按当前分支渲染对话 → S5：上下文用量改用 `get_session_stats` → S6：会话生命周期对齐 |
| 聊天体验 LobeHub 化（进行中） | `6090da6` `ea8b1d7` `77ca7a3` `b402ea4` `589b10d` `483d556` `05a2874` `ca5ca27` … `7a07753` | 一轮"过程"折叠 · 发送后钉顶滚动 · 助手消息头（头像 + 名字 + 相对时间）· 流式指示（转圈 + 操作感知文案 + 已用秒数）· 草稿持久化 · 输入历史 ↑/↓ · 斜杠命令 `/new` `/compact` · 消息动作栏单例 portal · 编辑消息（编辑并重发）· 页头标题 +「⋯」菜单 · 删除确认统一（自绘遮罩弹层）· a11y aria-label |

## 4. 关键文件地图（本轮重点）

| 文件 | 职责 |
|---|---|
| `lib/llm/cli.ts` | CLI 运行器：模板解析、Windows 命令解析、pi JSONL 解析（思考/正文/工具） |
| `lib/llm/piRpc.ts` | **pi RPC 模式**运行器（`--mode rpc`）：prompt 命令、`extension_ui_request` 对话协议 |
| `lib/llm/cliRuns.ts` | 正在运行的 CLI 注册表：浏览器答案 → 等待中的进程（globalThis 保活） |
| `lib/llm/piTools.ts` | pi 工具清单（内置/会话 `<tools>` 段/本地扩展）+ `buildPiToolFlags` 开关注入 |
| `lib/llm/tools.ts` | Hearth 内置工具定义 + `TOOL_CATALOG`（UI 与模型**同源**） |
| `lib/llm/compaction.ts` | 上下文压缩：`prepareContext`（判定→滚动摘要→该发的东西）+ `loadTopicMessages`/`topicContextStats`/`withSummaryInstruction` |
| `lib/llm/contextBudget.ts` | token 估算 + 压缩阈值/迟滞/漂移（**纯逻辑，客户端可 import**） |
| `lib/llm/modelContext.ts` | 上下文窗口识别（env `LLM_CONTEXT_WINDOW` > pi models.json 的 `contextWindow` > 内置 `/models` 的 `max_model_len`） |
| `lib/llm/agentEvents.ts` | 外部 CLI 输出统一为 AgentEvent + 薄 adapter |
| `lib/llm/heteroAgents.ts` | 外部 CLI 描述符目录（pi/opencode/claude）+ 安装检测 |
| `lib/llm/piSession.ts` | pi 会话持久化（topic ↔ pi session，历史交给 pi） |
| `lib/llm/piBranch.ts` | pi 会话树 / 分支导航（navigateTree 扩展） |
| `lib/llm/reasoning.ts` | 思考等级能力门（只列模型真正支持的档位）+ Agent 级切换 |
| `lib/db/topicSummaries.ts` | 摘要表读写（`getLatestSummary`/`listSummaries`/`insertSummary`/`deleteLatestSummary`/`deleteSummariesAfter`） |
| `app/api/topics/[id]/context/route.ts` | 上下文占用读数（GET）/ 手动压缩（POST）/ 撤销（DELETE） |
| `features/chat/ContextMeter.tsx` | 工具栏上下文 chip + popover（占用条 / 摘要预览 / 立即压缩 / 撤销） |
| `lib/skills/` | Agent Skills：`store.ts`（扫 `data/skills/`）+ `agent.ts`（`<available_skills>` 提示词 + `activate_skill` 工具） |
| `lib/mcp/` | MCP：`client.ts`（Streamable HTTP + 缓存/超时）+ `tools.ts`（转 AI SDK tool，`mcp__<server>__<tool>`） |
| `lib/db/mcpServers.ts` | MCP server 配置读写（`mcp_servers` 表，迁移 0010） |
| `lib/tools/settings.ts` | 工具开关纯逻辑（**不 import `ai`**，客户端可用） |
| `lib/db/messageParts.ts` | 消息片段与 AI SDK 的双向映射（刻意解耦，SDK 升级不污染历史；含 file 附件片段） |
| `lib/files/constants.ts` | 附件类型白名单/体积上限/`accept`（**纯常量，客户端可 import**） |
| `lib/files/uploads.ts` | 附件落盘：校验 → sha1 命名 → 写 `public/uploads`；读回字节/base64（**仅服务端**） |
| `lib/llm/attachments.ts` | UI file 片段 → 模型 `file` part（内置模型）/ base64 图片（pi）；只发当前轮图片 |
| `app/api/files/route.ts` | POST 上传附件（图片） |
| `app/api/chat/route.ts` | 聊天主路由：API 分支（工具）/ CLI 分支（json 或 RPC）/ 落库 |
| `app/api/tools/route.ts` | 按运行时返回工具目录（builtin / pi / external） |
| `app/api/topics/[id]/export/route.ts` | 会话导出（?format=md\|json，附件下载） |
| `lib/export/topicExport.ts` | 导出纯逻辑：Markdown 渲染 / JSON 备份 / 文件名清洗 |
| `app/api/cli-runs/[id]/answer/route.ts` | 提交"提问"的答案 |
| `app/api/cli-runs/route.ts` | GET 跨会话 pending 列表（island/徽章的轮询口） |
| `features/chat/` | `index.tsx`（主视图）、`ToolCard`、`ToolPicker`、`TodoPanel`、`QuestionBar`、`QuestionForm`、`PendingIsland`、`usePendingRuns`、`useAttachments`、`AttachmentPreview`、`interventions.ts`、`AssistantProcess`（过程折叠）、`SessionTree`（会话树面板）、`StreamingIndicator`、`MessageActionProvider` / `MessageActions`（动作栏单例 portal）、`EffortPicker`（思考等级） |
| `features/agent/` | Agent 列表/编辑页、`AgentAvatar`、`agentIcons`（品牌头像）、骨架 |
| `components/` | 主题壳、启动占位、`AsyncBoundary`、骨架、`useMediaQuery` |
| `.agents/skills/` | 领域细则（**改动相关领域前先读**：`builtin-tools`、`chat-streaming`、`agent-management`、`context-compaction`、`skills-and-mcp`、`ui-theming`、`topics-persistence`…） |

## 5. 环境与坑（必读）

- **构建用 webpack**：`npm run dev` / `npm run build` 都带 `--webpack`（本机 E 盘 junction 报 `os error 1392`；磁盘修复后可去掉）。
- **改 DB schema 必须重启 dev**：连接缓存在 `globalThis`，迁移只在打开连接时跑，否则 `no such column`。
- **迁移**：改 `lib/db/schema.ts` → `npx drizzle-kit generate --name <有意义的名字>`（自动写 SQL + snapshot + journal，**别手工改** `_journal.json`）。
- **pi 集成**：
  - 预设：`pi --mode rpc --system-prompt "{{systemPrompt}}"`（RPC 才能用扩展交互如 question；模板里**不要 `{{prompt}}`**，提示词走 RPC 命令）。
  - 工具开关：会话里的 `auto`→`--tools +名字`、`disabled`→`--exclude-tools 名字`，追加到命令末尾即可。
  - **`--system-prompt` 会替换 pi 默认系统提示（含 `<tools>` 段）**——所以工具清单要**往回扫最近若干会话**找那个有 `<tools>` 段的。
  - pi 事件：`message_update`（thinking/text/toolcall delta）、`message_end`（`role=toolResult` 带 `details`）、`extension_ui_request`（对话要按序入队处理！）、`agent_settled`。
  - **question 扩展在 RPC 下要用 `ctx.ui.select`**（2026-10-08）：`~/.pi/agent/extensions/question.ts`（**仓外**）原版判 `ctx.mode !== "tui"` 直接报错，RPC 下提问必失败；已改 tui→`ctx.ui.custom`、rpc→`ctx.ui.select`。验法：写个临时 RPC 探针（用完删）看 `extension_ui_request method:"select"` 是否发出。
  - **有等待回答的提问时切会话不能 `stop()`**（2026-10-08）：abort → 服务端 `req.signal` → kill pi，答案无处可送（表现：`/answer` 返 200 但进程早死了）。`features/chat/index.tsx` 的 `keepStream`/`streamBlocked` 就是干这个的，动切会话逻辑前先读它。
  - **pi"没有输出"先查 pi 自己的模型认证**（2026-10-08 踩过）：pi 的 provider 配在 `~/.pi/agent/models.json`（默认 provider 见 `settings.json`），服务端换 key 后 pi 会收到 `401`，`message_end` 里 `content` 为空、`stopReason:"error"`。诊断：`scripts/` 临时写个 RPC 探针打原始事件（看 `errorMessage`）；修：改 `models.json` 的 `apiKey`。**错误现已透出到界面**（`humanizePiError`，见 §7）；pi 版本用 `pi update self` 升级（当前 1.1.0，0.87→1.1 RPC 协议兼容）。
- **`refs/` 是只读参考书**：不入库、不许 import；学思路自己写（见 `license-and-references`）。
- **临时脚本**：放 `scripts/` 的调试脚本用完删掉（仓库里只留 `mock-llm.mjs`）。
- 旧数据兼容：早期 `messages` 行没有 `parts` 列 → 历史加载回落到 `content + reasoning`。

## 6. 怎么跑

```bash
npm install
cp .env.example .env.local   # 填 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL（任何 OpenAI 兼容接口）
npm run dev                  # http://localhost:3000
npm run --silent typecheck   # 类型检查（--silent 可去掉 npm 的 stderr 噪音）
```

数据库在 `data/app.db`（不入库）；外部 CLI Agent 需要本机装好对应的 CLI（pi / opencode / claude）。

## 7. 已知问题 / 未完成

- **L2-10 图片生成**：用户明确跳过（`image-generation` skill 还在，别当成待办）。
- **提问栏对齐已做**（2026-10-08，`12ec940`）：多 pending tab（防备位）+ 跨会话 island/徽章 + 注册表兜底重建 + "全部同意"按钮位。**剩余**：
  - "全部同意"只在全部 `method === 'confirm'` 时出现，而 question 工具走 `select` → **该路径没实测过**（需要一个会发 confirm 对话的场景）；
  - **僵尸标记**：run 中途被杀（旧 bug/直接杀进程）后，DB 里留在 `input-available` 的提问片段刷新后仍渲染提问栏，提交回 404（"回答提交失败"）——旧测试会话删掉即可，要不要做"按注册表过滤标记"待定；
  - **刷新页面会杀挂起的 pi**（fetch 断 → `req.signal` → kill），注册表条目留到有人回答才自清；设计上要"断流重连"才能根治（大改，先记着）。
- **附件已做图片 + 文本 + Office/PDF**（L2-9 A/B/C 期，2026-10-09）：图片走多模态（内置模型 `file` part / pi `prompt.images`），
  文本类与 docx/xlsx/pptx/pdf 抽成 `<file name>` 文本块（内置模型拼进消息、CLI 并进 prompt）。
  **不支持**：旧版 `.doc/.xls/.ppt`（OLE 二进制，上传即拒并提示另存）、**扫描版 PDF**（没有文字层，抽出来是空）。
  取舍与坑见 `.agents/skills/attachments-multimodal`：
  - **只有当前轮的附件内容进模型**（历史里的附件只留引用）——看旧图/重读旧文件要用户重发；
  - 超长文件（>5 万字）**只给 4000 字预览 + 明确声明"剩余读不到"**；纯文本模型（`LLM_VISION=0`）时图片换成显式占位符而不是静默丢；
  - 文本文件进 prompt 每文件截断到 50k 字（超了走预览）；文本 1MB / 图片 5MB / 文档 PDF 10MB；单条消息 6 个附件；
  - `public/uploads/` **没有清理机制**（同内容 sha1 去重，但删除会话不会删文件）；
  - **非 RPC 的外部 CLI**（json 模式的 opencode 等）传不了图，图片附件会被静默忽略（文本仍然并进 prompt）。
- **pi 工具开关**：`grep` 做过行为验证；`powershell/ls/find` 机制相同但未逐一实测。
- **pi 出错时界面静默**：已修（2026-10-08）——`parsePiEvent` 现在把 assistant `message_end` 的 `errorMessage` 透出成可读正文（`humanizePiError`：401/403/404/429 各有指引），坏 key 实测显示"⚠️ pi 调用模型失败：…检查 ~/.pi/agent/models.json"。
- **i18n（L2-8）**：未做。
- 移动端只做了竖屏主流程（消息操作按钮仍是小尺寸）。

## 8. 下一步建议（挑一个）

1. **个人记忆（L2-13）**：`user_memory` 表 + "我的记忆"页 + 对话前拼进提示词。
2. **附件收尾**：扫描版 PDF 走 OCR（要装外部工具）、`public/uploads` 的清理策略（删会话时删文件？）、旧版 Office 若真要支持得装 LibreOffice。
3. **断流重连**（根治"刷新页面会杀挂起的 pi"，见 §7；设计上大改）。
4. **i18n（L2-8）**：中英双语（可选，按需）。

> 工作节奏见 `vibe-coding-discipline` skill：**小步**（一次一个小功能）、随时能跑、验收后立刻 commit、约定变了先改 AGENTS.md/skill。
