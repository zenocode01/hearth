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

## 技术栈（家用配方）

Next.js 16（App Router）+ TypeScript + @lobehub/ui + antd + Vercel AI SDK（流式聊天）。
后续阶段按需加入：SQLite + Drizzle（持久化）。

## 项目文档

- `AGENTS.md` —— AI 编码助手守则（仓库级规则）
- `.agents/skills/` —— 按主题的开发细则（SKILL.md）
- `docs/replica/` —— 复刻指南：01 大白话 → 03 蓝图（功能取舍）→ 04 路线图（5 阶段实操）→ 05 许可证
- `refs/lobe-chat/` —— LobeHub 源码快照，**只读参考**（不参与构建、不 import）

## 当前阶段

阶段 1 完成（见 `docs/replica/04`）：聊天 + 流式回复 + Markdown/代码高亮 + 可读错误。
下一步阶段 2：会话持久化（SQLite + Drizzle，刷新不丢）。
