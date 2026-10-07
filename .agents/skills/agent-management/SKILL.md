---
name: agent-management
description: 'Use for the agents table, Agent Builder form, agent list, agent selector and per-agent persona/model/temperature. Blueprint L1-3, roadmap phase 3.'
---

# Agent 管理（L1-3）

已落地（阶段 3）：多个人设（名字/头像/人设/模型/温度）+ 聊天页选择器 + 改人设立即生效。

## 已落地结构

- **表**：`agents(id, name, avatar, system_prompt, model, temperature, created_at, updated_at)`；`topics.agent_id`（可空，`ON DELETE SET NULL`——删 Agent 后会话回到默认）。
- **API**：`GET/POST /api/agents`、`GET/PATCH/DELETE /api/agents/[id]`、`POST /api/agents/test`（**无状态**：直接用表单里的配置试一句，未保存也能测）、`GET /api/models`（从 provider 的 `/models` 拉列表，拉不到就退化成只有"默认"）。
- **页面**：`/agents` 列表（头像+名称/模型/人设摘要，编辑/删除用图标按钮 + Tooltip，删除两段确认）、`/agents/new`、`/agents/[id]`（`features/agent/`）。
- **编辑页（已打磨）**：`EmojiPicker`（lobe-ui 自带，emoji-mart 数据集，关掉 upload 保持纯 emoji）+ `ColorSwatches`（`primaryColorsSwatches`，注意它是 `string[]`，要 map 成 `{ color }`）+ **顶部预览卡**（改什么立刻看到）+ 分区卡片（基本信息 / 人设 / 模型与参数 / 测试结果）。
- **头像组件**：`features/agent/AgentAvatar.tsx` = 带底色的圆角方块 + `FluentEmoji`，列表 / 切换器 / 编辑页预览共用同一个组件。
- **聊天接入**：**Agent 切换器在侧栏顶部**（会话列表上方，与 LobeHub 的 `AgentSidebar/Header/Agent` 一致）：触发器是"头像 + 名字 + 上下箭头"，点开是切换面板（含"管理 Agent"入口）。聊天顶栏只留标题与主题控件。新建会话时带上 `agentId`，已有会话切换 Agent 走 `PATCH /api/topics/[id]`。

## 关键坑（都踩过）

- **品牌头像**：`agents.avatar` 存 `icon:<key>`（如 `icon:opencode`）→ `AgentAvatar` 渲染 `@lobehub/icons` 的品牌 logo（`Icon.Avatar`：品牌色底 + 白色 glyph，`shape="square"`）。清单在 `features/agent/agentIcons.tsx`（13 个，参考 refs 的 heterogeneous-agents 映射）。CLI 运行方式下编辑页有「品牌图标」选择行；点 CLI 预设会顺带把头像设为该品牌（当前是默认 emoji 或已是品牌图标时才动）。
  - 类型坑：`IconType`（根导出）只是**单色图标**，没有 `.Avatar` / `.Combine` / `.Text`；复合类型用某个品牌组件自己的类型（我们统一 `type BrandIcon = typeof Pi`，各品牌结构一致）。
  - 坑：EmojiPicker 收到 `icon:xxx` 会渲染成 `IC`（它认不出），品牌头像时 `value` 要回落到默认表情。
  - 坑：lobe-icons 的 Mono SVG 里带 `<title>Pi</title>`，所以 `button.textContent` 是 `"PiPi"`——写 DOM 查询/测试时别用 `=== 'OpenCode'`。
  - 图标不依赖 CDN：LobeHub 那边还可以用 `getLobeIconCDN(id, { format: 'avatar' })` 取远程头像图，我们直接渲染组件（离线可用）。

- **base-ui Popover 的触发器不能是 `<button>`**：用 lobe-ui 的 `Button` 当触发器会报 `Base UI: A component that acts as a button expected a non-<button>...`。要 `nativeButton={false}` + 非 button 触发器（`Block` / div）。参考 `SidebarHeaderSelectPopover` 的写法。
- **选完要自己关闭面板**：LobeHub 靠路由跳转关闭；我们不跳路由，所以 Popover 要**受控**（`open` + `onOpenChange`），选中时 `setOpen(false)`。

- **AI SDK v7 不允许在 `messages` 里放 system 消息**：会报 `AI_InvalidPromptError: System messages are not allowed...`。人设要走 **`instructions`** 选项（`generateText` / `streamText` 都一样）。
- **PATCH 必须只更新显式字段**：用"全量归一化"（缺省字段给默认值）会把没传的 name/avatar 冲成默认值——只改人设就会把 Agent 改名。见 `lib/agents/normalize.ts` 的 `normalizeAgentPatch`。
- **Next 路由文件不能导出额外函数**：把归一化逻辑放到 `lib/agents/normalize.ts`（否则 `.next/types` 类型检查报 `does not satisfy the constraint`）。
- **人设"立即生效"靠实时读库**：聊天时按 `topic.agentId ?? body.agentId` 每次都从库里读 Agent，不做缓存；所以改完人设下一条就变。
- **模型可被 Agent 覆盖**：`createChatModel(agent?.model)`；为空则用 `.env.local` 的默认模型。

## 外部 CLI Agent（参考 refs 的 heterogeneous agents）

Agent 的**运行方式**可以是「内置模型 API」或「外部 CLI」——把消息交给本机的命令行 agent（pi / opencode / claude…）执行，stdout 流式回吐到聊天里。

- **表**：`agents.runtime`（`'api' | 'cli'`，默认 api）、`agents.cli_command`（命令模板）。
- **命令模板**（`lib/llm/cli.ts`）：
  - `{{prompt}}` → 「人设 + 对话历史 + 本次输入」（模板里没有它时，内容走 **stdin**）
  - `{{systemPrompt}}` → 人设；模板里没有它时，人设**并进 prompt 开头**
  - 预设：Pi `pi -p --mode json --system-prompt "{{systemPrompt}}" "{{prompt}}"`、OpenCode `opencode run "{{prompt}}"`、Claude Code `claude -p --append-system-prompt "{{systemPrompt}}" "{{prompt}}"`（参考 LobeHub 的 `OPENCODE_BASE_ARGS = ['run','--format','json','--thinking','--auto']` 等）
- **思考过程（推理）**：部分 CLI 的 JSON 模式会带思考流，解析出来写成 `reasoning-delta` → UI 里的「思考过程」块。pi 的事件是 JSONL：
  - `{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","delta":"…"}}` → 推理
  - `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"…"}}` → 正文
  - 顶层还有 `session / agent_start / turn_start / message_start / message_end / turn_end / agent_end / agent_settled / tool_* / error`
  - **不要做事件类型白名单**：pi 的类型会增长（踩过——`turn_end`/`agent_end` 不在白名单里，整坨 JSON 漏进了正文）。正确做法：**带 `type` 的 JSON 行一律当协议事件，只有 `message_update` 的 delta 才是内容，其余全部丢弃**。纯文本 CLI 则完全不解析（首次看到的第一行不是事件 → 整个输出按文本透传）。
- **安全**：自己把模板拆成 argv（`parseCommandTemplate`）后 `spawn(file, args, { shell: false })`，**不走 shell** → 用户输入不会被当成 shell 语法执行。
- **Windows 启动坑**：`spawn` **不补扩展名**（npm 全局包装出来的是 `pi.cmd`，没有 `pi.exe`）→ 直接报 `spawn pi ENOENT`；而 `.cmd`/`.bat` 又**不能**直接 spawn（`EINVAL`）。解法（`resolveCliCommand`）：
  1. `where.exe <name>` 找实际路径，优先 `.exe` → `.cmd` → `.bat` → `.ps1`
  2. `.cmd`/`.bat`：从 shim 里抠出它执行的目标——**要抠出全部 `%dp0%` 引用，只挑磁盘上真实存在的**（踩过：新版 pi 的 shim 顶部有 `IF EXIST "%dp0%\node.exe"` 探测，只取第一个匹配就会拿到不存在的 node.exe → 解析失败 → 兜底直接 spawn `.cmd` → `spawn EINVAL`）。有 `.js`/`.mjs` 就优先用它 + `process.execPath`；否则跑 `.exe`（跳过 node.exe），见 `targetFromCmdShim`
  2b. 解析不出来时**直接报错**，不要退回 `spawn(某.cmd)`——Windows 上那必然 `EINVAL`
  2c. spawn 遇到非法参数是**同步抛错**（不是 `error` 事件）：要 `try/catch` 包住并带上诊断（`describeCommand`：file / 参数概要 / 最长参数长度），否则用户只看到光秃秃的 `spawn EINVAL`
  3. `.ps1`：改用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`
  4. 找不到 → 错误信息里带上 `where <name>` 的自查提示
- **环境变量前缀**：模板最前面可写 `KEY=value`（`extractEnvPrefix`，只在开头连续生效），spawn 时并进 `process.env`——不经过 shell，例如 opencode 隔离数据目录：`XDG_DATA_HOME=D:\oc-data opencode run "{{prompt}}"`。
- **ANSI 清理**：CLI 报错常带颜色码（`\u001B[91m`），正文与 stderr 都要 `stripAnsi`，否则用户看到乱码（踩过：opencode 的报错）。
- **opencode 特有坑**：它用 `~/.local/share/opencode/opencode.db`（本机 327MB）存会话；**桌面端/其它实例正在用这个库时**，CLI 会报 `Database is not empty and has no session table`（版本间 schema 不一致）。解法：`XDG_DATA_HOME=<独立目录>` 给它一份自己的库（实测可用，预设里默认带 `XDG_DATA_HOME=%LOCALAPPDATA%\Hearth`）。**不要删那个库**——它可能是桌面端正在跑的数据。
- **环境变量展开**：模板里可写 `%VAR%`（大小写不敏感，找不到保留原文），在**占位符替换之前**展开——顺序反了会把用户消息里的 `%xx%` 误伤。
- **opencode 的思考过程（暂不做）**：`opencode run --format json --thinking` 能拿到 `{"type":"reasoning","part":{"text":…}}`，但**实测不是逐字流**（part 完成才整段到达：4 个事件 step_start → reasoning → text → step_finish），会牺牲「打字机」验收项。所以预设保持默认模式（流式正文、无思考）。将来要做的话，得另找流式通道（TUI 用的本地 server/SSE）。
- **聊天路由**：`createUIMessageStream({ execute })` 里把 `runCliAgent()` 的 stdout 逐块写成 `text-delta`；`generateId: () => createId('msg')` 保证消息 id 与客户端一致（删除/重新生成照常可用）；`onEnd` 复用同一套落库逻辑。
- **失败处理**：命令不存在 / 退出码非 0 → 把错误作为正文写进气泡（`> 运行失败：…`），而不是断流。

## 验收（`docs/replica/04` 阶段 3）

- [x] "资深后端工程师"（温度 0.2）与"段子手"（温度 1.2）问同一问题，回答风格明显不同（一个"结论+要点 1/2/3"，一个"图书馆找书"的段子）
- [x] 改完人设立即生效（同一会话里把人设改成"只回复收到"，下一条回复就是"收到"）
- [x] 头像能换（emoji 输入 + 预设快选，`FluentEmoji` 渲染）
