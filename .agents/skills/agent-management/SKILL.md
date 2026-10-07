---
name: agent-management
description: 'Use for the agents table, Agent Builder form, agent list, agent selector and per-agent persona/model/temperature. Blueprint L1-3, roadmap phase 3.'
---

# Agent 管理（L1-3）

已落地（阶段 3）：多个人设（名字/头像/人设/模型/温度）+ 聊天页选择器 + 改人设立即生效。

## 已落地结构

- **表**：`agents(id, name, avatar, system_prompt, model, temperature, created_at, updated_at)`；`topics.agent_id`（可空，`ON DELETE SET NULL`——删 Agent 后会话回到默认）。
- **API**：`GET/POST /api/agents`、`GET/PATCH/DELETE /api/agents/[id]`、`POST /api/agents/test`（**无状态**：直接用表单里的配置试一句，未保存也能测）、`GET /api/models`（从 provider 的 `/models` 拉列表，拉不到就退化成只有"默认"）。
- **页面**：`/agents` 列表（编辑/删除两段确认）、`/agents/new`、`/agents/[id]`（`features/agent/`）。
- **聊天接入**：**Agent 切换器在侧栏顶部**（会话列表上方，与 LobeHub 的 `AgentSidebar/Header/Agent` 一致）：触发器是"头像 + 名字 + 上下箭头"，点开是切换面板（含"管理 Agent"入口）。聊天顶栏只留标题与主题控件。新建会话时带上 `agentId`，已有会话切换 Agent 走 `PATCH /api/topics/[id]`。

## 关键坑（都踩过）

- **base-ui Popover 的触发器不能是 `<button>`**：用 lobe-ui 的 `Button` 当触发器会报 `Base UI: A component that acts as a button expected a non-<button>...`。要 `nativeButton={false}` + 非 button 触发器（`Block` / div）。参考 `SidebarHeaderSelectPopover` 的写法。
- **选完要自己关闭面板**：LobeHub 靠路由跳转关闭；我们不跳路由，所以 Popover 要**受控**（`open` + `onOpenChange`），选中时 `setOpen(false)`。

- **AI SDK v7 不允许在 `messages` 里放 system 消息**：会报 `AI_InvalidPromptError: System messages are not allowed...`。人设要走 **`instructions`** 选项（`generateText` / `streamText` 都一样）。
- **PATCH 必须只更新显式字段**：用"全量归一化"（缺省字段给默认值）会把没传的 name/avatar 冲成默认值——只改人设就会把 Agent 改名。见 `lib/agents/normalize.ts` 的 `normalizeAgentPatch`。
- **Next 路由文件不能导出额外函数**：把归一化逻辑放到 `lib/agents/normalize.ts`（否则 `.next/types` 类型检查报 `does not satisfy the constraint`）。
- **人设"立即生效"靠实时读库**：聊天时按 `topic.agentId ?? body.agentId` 每次都从库里读 Agent，不做缓存；所以改完人设下一条就变。
- **模型可被 Agent 覆盖**：`createChatModel(agent?.model)`；为空则用 `.env.local` 的默认模型。

## 验收（`docs/replica/04` 阶段 3）

- [x] "资深后端工程师"（温度 0.2）与"段子手"（温度 1.2）问同一问题，回答风格明显不同（一个"结论+要点 1/2/3"，一个"图书馆找书"的段子）
- [x] 改完人设立即生效（同一会话里把人设改成"只回复收到"，下一条回复就是"收到"）
- [x] 头像能换（emoji 输入 + 预设快选，`FluentEmoji` 渲染）
