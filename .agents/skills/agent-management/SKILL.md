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
  - 预设：Pi `pi -p --system-prompt "{{systemPrompt}}" "{{prompt}}"`、OpenCode `opencode run "{{prompt}}"`、Claude Code `claude -p --append-system-prompt "{{systemPrompt}}" "{{prompt}}"`（参考 LobeHub 的 `OPENCODE_BASE_ARGS = ['run','--format','json','--thinking','--auto']` 等）
- **安全**：自己把模板拆成 argv（`parseCommandTemplate`）后 `spawn(file, args, { shell: false })`，**不走 shell** → 用户输入不会被当成 shell 语法执行。
- **聊天路由**：`createUIMessageStream({ execute })` 里把 `runCliAgent()` 的 stdout 逐块写成 `text-delta`；`generateId: () => createId('msg')` 保证消息 id 与客户端一致（删除/重新生成照常可用）；`onEnd` 复用同一套落库逻辑。
- **失败处理**：命令不存在 / 退出码非 0 → 把错误作为正文写进气泡（`> 运行失败：…`），而不是断流。

## 验收（`docs/replica/04` 阶段 3）

- [x] "资深后端工程师"（温度 0.2）与"段子手"（温度 1.2）问同一问题，回答风格明显不同（一个"结论+要点 1/2/3"，一个"图书馆找书"的段子）
- [x] 改完人设立即生效（同一会话里把人设改成"只回复收到"，下一条回复就是"收到"）
- [x] 头像能换（emoji 输入 + 预设快选，`FluentEmoji` 渲染）
