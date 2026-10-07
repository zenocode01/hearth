# pi-web

LobeHub 的**功能复刻版**（"家用配方"）：用几万行代码覆盖 80% 日常体验的个人 AI 聊天 + Agent 工作台。

本项目为独立实现，设计参考了 LobeHub（LobeHub Community License）；使用 MIT 协议的 @lobehub/ui 与 @lobehub/icons。

## 怎么跑

```bash
npm install
npm run dev   # → http://localhost:3000
```

- `npm run build`：生产构建（验证用）
- `npm run typecheck`：TypeScript 检查

## 技术栈（家用配方）

Next.js（App Router）+ TypeScript + @lobehub/ui + @lobehub/icons + antd。
后续阶段按需加入：Vercel AI SDK（流式聊天）、SQLite + Drizzle（持久化）。

## 项目文档

- `AGENTS.md` —— AI 编码助手守则（仓库级规则）
- `.agents/skills/` —— 按主题的开发细则（SKILL.md）
- `docs/replica/` —— 复刻指南：01 大白话 → 03 蓝图（功能取舍）→ 04 路线图（5 阶段实操）→ 05 许可证
- `refs/lobe-chat/` —— LobeHub 源码快照，**只读参考**（不参与构建、不 import）

## 当前阶段

阶段 0 · 项目骨架（见 `docs/replica/04`）：Next.js + lobe-ui 风格空页面 + 深浅色切换。
