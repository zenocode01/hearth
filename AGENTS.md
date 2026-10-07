# pi-web 开发守则（给 AI 编码助手）

本项目是 **LobeHub 的功能复刻版**（"家用配方"）：用几万行代码覆盖 80% 日常体验的个人 AI 聊天 + Agent 工作台。
人读的完整指南在 `docs/replica/`（先读 `03 复刻蓝图` 与 `04 路线图`）；本文件是 AI 助手的仓库级守则。

## 项目目标与范围

- **做什么**：聊天（流式）+ 会话管理 + 多 Agent 人设 + 1~2 家模型接入 + 主题，之后按 `docs/replica/03` §3 勾选表逐项扩展。
- **不做什么**：`03` 的 L3 清单（多 Agent 协作、定时任务、IM 网关、Electron 桌面端、Agent 市场、评估系统、可观测性、CLI/插件/知识库）——除非用户明确要求，否则拒绝实现。
- **复刻 = 挑功能，不是抄行数**。每个功能用简化版：够用、好懂、好改。预期代码量是 LobeHub 的 3~5%。

## 参考资料使用规则（合规红线）

- `refs/lobe-chat/` 与 `refs/lobe-icons/` 是**只读参考书**：只许读，不许改、不许 import、不参与构建。
- **学思路，自己写代码**。可以说"参考 refs/lobe-chat/src/features/Chat 的消息结构，用我们自己的方式实现"；**禁止整段复制粘贴** LobeHub 主仓库代码（它是 LobeHub Community License：改后对外发行需商业授权，见 `docs/replica/05`）。
- **MIT 组件可直接安装使用**：`@lobehub/ui`、`@lobehub/icons`、`@lobehub/editor`。
- "LobeHub" 名字与 LOGO 是商标：产品用自己的名字，可以说"设计参考了 LobeHub"。
- 不确定某段代码能不能搬时：**重写它**，别赌边界。细节见 `license-and-references` skill。

## 技术栈（家用配方）

| 层 | 技术 | LobeHub 对应物（只学思想） |
|---|---|---|
| 框架 | Next.js（App Router，单项目前后端一体） | Next.js 壳 + Vite 多 SPA |
| 语言 | TypeScript | 同 |
| 流式 | Vercel AI SDK `streamText` | 自研 fetch-sse |
| 数据库 | SQLite + Drizzle（零运维，以后可换 PostgreSQL） | PostgreSQL + Drizzle（71 表） |
| 状态 | 组件状态起步；需要时再拆 zustand 域 store | 37 个 zustand store + SWR |
| UI | `@lobehub/ui`（MIT，基于 antd）+ `@lobehub/icons` | 同左（大厂直接复用） |
| Markdown | react-markdown + shiki | @lobehub/editor |
| 部署 | 本地 `npm run dev`；之后 `npx vercel` | Vercel / Docker compose |

> 为什么降级：vibe coding 的失败率主要来自"技术太新太偏，AI 生成的代码你自己读不懂"。选 AI 语料里的"大路货"（`docs/replica/03` §4）。

## 代码归属（目标目录约定）

```
pi-web/
├── app/                 # Next.js 页面 + API 路由（薄页面，只做组合）
│   ├── (chat)/          #   聊天主界面
│   ├── agents/          #   Agent 管理
│   ├── settings/        #   模型/密钥/主题
│   └── api/             #   /api/chat /api/topics /api/agents …
├── features/            # 域业务 UI 与逻辑（一个功能一个目录）
├── lib/
│   ├── db/              #   SQLite + Drizzle：schema + 连接
│   └── llm/             #   模型适配：1~2 家 provider
├── components/          # 通用小组件（优先用 @lobehub/ui 现成的）
├── docs/replica/        # 人读的项目指南（"为什么"）
├── .agents/skills/      # AI 编码细则（每个主题一份 SKILL.md）
├── refs/                # ★ 只读参考书，不参与构建
└── AGENTS.md            # 本文件
```

- 路由文件（`app/**`）只做组合与转发；业务 UI/逻辑进 `features/<Domain>/`。
- 组件不直接发请求；调用走 `lib/` 或 `features/` 里的 service（后期再引入 SWR/React Query）。
- 一个功能长大了（比如工具越来越多）再拆独立包——**从单体长到 monorepo，而不是从 monorepo 学起**。

## 开发工作流

- 装好依赖后：`npm run dev` → http://localhost:3000
- **Next 16 有破坏性变更**：写 Next 相关代码前，先读 `node_modules/next/dist/docs/` 里对应指南（文末 Next 自动生成区块也提醒了这点），不要凭训练记忆写。
- Git：每个**通过验收的小功能**一个 commit；message 写清改了什么。主干即开发分支。
- 依赖：只加 `docs/replica/03` §4 清单里的包；新依赖先问用户。

## Vibe coding 纪律（硬规则）

1. **小步**：一次只做一个小功能（一个按钮、一个接口、一张表）。拒绝"把整个 App 做了"式任务。
2. **随时能跑**：每步结束项目必须能启动；任何时刻都能 `git reset` 回退。
3. **勤存档**：功能跑通并经用户验收 → 立刻 commit。
4. **喂参考**：卡住或要新风格时，先读 `refs/lobe-chat` 对应部分，再写自己的实现。
5. **守则先行**：约定变了 → 先改 AGENTS.md / 对应 skill，再写代码。

## 质量与验收

- 每个里程碑按 `docs/replica/04` 的"验收"清单**人工点验**：流式逐字、刷新不丢、错误有可读提示、空/加载/错误三态齐全。
- **流式必须真流式**（打字机效果）；失败路径（断网、错 key）必须有友好提示——这是验收项，不是可选项。
- 纯样式调整（颜色、间距）可免回归走查；功能改动必须人工走一遍主流程。
- 自用项目以人工验收 + commit 存档为准，不写"为了测试而测试"的套件。

## Agent Skills

`.agents/skills/` 存放按需加载的开发细则。AGENTS.md 只管仓库级规则，领域细节进 skill（单一事实来源）。

- 开始某类任务前读对应 skill（如做聊天功能前读 `chat-streaming`）。
- skill 格式：YAML frontmatter（`name` / `description` 含触发词）+ Markdown 正文 + 可选 `references/`。
- **生长规则**：同一条经验第三次出现、或做完一个功能发现"下次还会踩"→ 写成或更新 skill；新增 skill 后自查一遍目录（重名、边界不清、引用失效）。

## 演进路线

阶段 0~5 见 `docs/replica/04`；当前进度由 `project-overview` skill 维护。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
