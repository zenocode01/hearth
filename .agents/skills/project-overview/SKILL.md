---
name: project-overview
description: 'Use for the Hearth repository map, current roadmap phase, blueprint navigation and layer ownership.'
---

# Hearth 项目概览

## 项目是什么

LobeHub 的**功能复刻版**（个人 + vibe coding）：聊天 + 会话 + Agent 人设 + 模型接入 + 主题。
人读指南：`docs/replica/`（01 大白话 → 06 进阶）。AI 守则：根目录 `AGENTS.md`。

## 参考系（只读，不参与构建）

- `refs/lobe-chat/` —— LobeHub 完整源码快照（canary 分支）。查"它怎么做的"，**只学思路不抄代码**（见 `license-and-references`）。
- `refs/lobe-icons/` —— 图标库源码（MIT）。

## 目录归属

| 层 | 位置 | 职责 |
|---|---|---|
| 页面 | `app/` | 路由 + API 路由，薄，只做组合 |
| 业务 | `features/` | 域 UI + 逻辑（一个功能一个目录） |
| 数据 | `lib/db/` | SQLite + Drizzle schema + 连接 |
| 模型 | `lib/llm/` | provider 适配（1~2 家） |
| 组件 | `components/` | 通用小组件（优先 @lobehub/ui 现成的） |

## 数据流（目标）

```
React UI → features/ 里的 action/service → app/api 路由 → lib/llm provider → 大模型 API
                                  ↘ lib/db（Drizzle）→ SQLite
```

## 当前阶段

按 `docs/replica/04` 的阶段 0~5 推进。完成一个阶段后更新下面的标记，并把验收结果记进 commit：

- [x] 阶段 0 · 项目骨架（Next.js 16 + lobe-ui + 深浅色切换 ✅ 2026-10，附主题切换动画：淡入/圆形/无，右上主题坞可切换）
- [x] 阶段 1 · 能聊天的页面（流式）—— ✅ 2026-10 真实模型（qwen3.8-27b）验收通过：流式逐字 + Markdown 代码高亮 + 可读错误
- [x] 阶段 2 · 会话与持久化 —— ✅ 2026-10 SQLite + Drizzle（`data/app.db`）：刷新/重启不丢、侧栏新建/切换/改名/删除、级联删除已验证
- [x] 阶段 3 · Agent 管理 —— ✅ 2026-10 agents 表 + `/agents` 列表/编辑页 + 聊天页选择器；同一问题两个人设回答风格明显不同，改人设立即生效
- [x] 附加 · 外部 CLI Agent（超出原路线图）—— ✅ 2026-10 pi / opencode / claude 描述符目录 + 安装检测，CLI 输出统一 AgentEvent；**pi 深度集成**：RPC 模式 / 思考流 / 工具卡片 + 开关 / todo / question 对话 / **会话树与分支**（topic ↔ pi session，按分支渲染，生命周期）
- [x] 阶段 4 · 打磨 —— ✅ 2026-10 主题（深浅色 + 切换动画）· 三态（启动占位 / 骨架 / 错误可重试，`AsyncBoundary`）· 移动端响应式（侧栏抽屉 / 主题控件收起 / 表单竖排 / 安全区）。**i18n 暂缓**
- [ ] 阶段 5 · 扩展（按 03 勾选表）—— 进行中：
  - ✅ **L2-9 附件**（2026-10：图片多模态 + 纯文本 + Office/PDF 抽文本，见 `attachments-multimodal`）
  - ✅ **L2-11 工具调用**（2026-10：计算器 / 当前时间 / 抓网页三个内置工具 + 工具卡片 + 片段落库，见 `builtin-tools`）
  - ✅ **上下文压缩**（2026-10：超阈值把旧历史压成滚动摘要，内置与 CLI 都走，工具栏 chip 可看占用/手动压/撤销，见 `context-compaction`）
  - ✅ **MCP（L2-12）** 与 **Agent Skills**（2026-10-10：外部 MCP server 工具并入 + 本地 SKILL.md 按需加载，`/mcp`、`/skills` 页，见 `skills-and-mcp`）
  - ✅ **L2-15 导出/备份**（2026-10-08：侧栏导出 .md/.json + 附件下载）
  - ✅ **思考等级**（2026-10-09：Agent 级切换 + 能力门 + 工具栏 chip）
  - 🚧 **聊天体验 LobeHub 化**（2026-10-10，**进行中**）：消息编辑（编辑并重发）/ 斜杠命令 / 输入历史 / 草稿持久化 /「过程」折叠 / 助手消息头 / 钉顶滚动 / 流式指示 / 页头标题 +「⋯」菜单 / 删除确认统一——均已落地，**过程还在迭代**
  - ⏭️ 用户明确**跳过 L2-10 图片生成**

## 蓝图导航

- 功能取舍：`docs/replica/03`（L1 必做 / L2 按需 / L3 砍）
- 实操与提示词模板：`docs/replica/04`
- 许可证与合规：`docs/replica/05`
- LobeHub 工程规范（进阶）：`docs/replica/06` + `refs/lobe-chat/AGENTS.md` + `refs/lobe-chat/.agents/skills/`
