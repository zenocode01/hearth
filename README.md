# Hearth

LobeHub 的**功能复刻版**（"家用配方"）：用几万行代码覆盖 80% 日常体验的个人 AI 聊天 + Agent 工作台。

本项目为独立实现，设计参考了 LobeHub（LobeHub Community License）；使用 MIT 协议的 @lobehub/ui 与 @lobehub/icons。

## 启动项目（三步）

```bash
# 1. 安装依赖（只需第一次 / 拉取新代码后）
npm install

# 2. 配置模型（编辑 .env.local，填入你的 key；改完 dev server 会自动重载）
#    LLM_API_KEY=你的key
#    LLM_BASE_URL=https://api.openai.com/v1
#    LLM_MODEL=gpt-4o-mini
#    各家示例见 .env.example

# 3. 启动
npm run dev
```

然后打开：

| 地址 | 页面 |
|---|---|
| http://localhost:3000 | 首页（入口） |
| http://localhost:3000/chat | 聊天 |

停止：终端里按 `Ctrl + C`。

### 没有 key 也能跑（离线联调）

```bash
# 终端 A
npm run mock:llm
# 终端 B：把 .env.local 切到文件里注释的 mock 三行，再 npm run dev
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（http://localhost:3000） |
| `npm run build` | 生产构建（改完代码验证用） |
| `npm run typecheck` | TypeScript 检查 |
| `npm run mock:llm` | 本地 mock 模型服务（端口 9123，离线联调用） |

> 构建脚本带 `--webpack`：本机 E: 盘创建 junction 报错（os error 1392），Turbopack 会构建失败；
> 磁盘修复（管理员运行 `chkdsk E: /f`）后可去掉 `--webpack` 切回。

## 功能

- **聊天**：流式逐字 + Markdown/代码高亮 + 推理过程（思考块）+ 会话管理（改名/删除/分支/重新生成）
- **Agent**：多人设（人设/头像/模型/温度），头像可用 `@lobehub/icons` 的品牌 logo
- **模型**：任何 OpenAI 兼容接口（OpenAI / 通义 / DeepSeek / 本地 llama.cpp…）
- **工具调用**：内置计算器 / 当前时间 / 抓网页，聊天里显示工具卡片，可按会话开关
- **外部 CLI Agent**：把消息交给本机的 `pi` / `opencode` / `claude` 执行；与 **pi** 深度集成——
  思考流、工具卡片、todo 清单、question 提问（可在输入框上方直接回答）、工具开关
- **主题与体验**：深浅色 + 切换动画、空/加载/错误三态、启动占位、手机竖屏适配

## 技术栈（家用配方）

Next.js 16（App Router）+ TypeScript + `@lobehub/ui` + antd + Vercel AI SDK（流式/工具调用）
+ SQLite + Drizzle（持久化）。构建用 webpack（原因见上）。

## 项目文档

- `AGENTS.md` —— AI 编码助手守则（仓库级规则）
- `.agents/skills/` —— 按主题的开发细则（SKILL.md）
- `docs/replica/` —— 复刻指南：01 大白话 → 03 蓝图（功能取舍）→ 04 路线图（5 阶段实操）→ 05 许可证
- `refs/lobe-chat/` —— LobeHub 源码快照，**只读参考**（不参与构建、不 import）

## 当前阶段

- **阶段 0~4 已完成**（见 `docs/replica/04`）：骨架+主题、流式聊天、SQLite 持久化、Agent 管理、打磨（三态/响应式）
- **阶段 5 进行中**：✅ 工具调用（L2-11）；⏭️ 图片生成（L2-10）已跳过
- **额外**：外部 CLI Agent 集成（尤其 pi 的思考/工具/清单/提问/开关）

进度与"下一步"的完整交接说明见 **`docs/HANDOFF.md`**。

## 许可证

本项目采用 **Apache License 2.0**（见 [`LICENSE`](./LICENSE)）。

关于参考与依赖的边界（合规红线）：

- 本项目是**独立实现**，只把 LobeHub 当**设计参考**（"学思路，自己写代码"），**不包含** LobeHub 的源码；
- `refs/`（LobeHub / lobe-icons 源码快照）是本地**只读参考书**，**不入库、不参与构建、不 import**；
- 运行时使用 MIT 协议的 `@lobehub/ui`、`@lobehub/icons`；
- "LobeHub" 名称与 LOGO 归其所有者，本项目与 LobeHub 官方无关联。
