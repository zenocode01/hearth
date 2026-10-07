---
name: topics-persistence
description: 'Use for SQLite + Drizzle setup, topics/messages schema, session CRUD and the sidebar list. Blueprint L1-2, roadmap phase 2.'
---

# 会话持久化（L1-2）

刷新/重启不丢；左侧会话列表：新建 / 切换 / 改名 / 删除。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/packages/database/src/schemas/` —— topics/messages 表字段（只取需要的列）
- `refs/lobe-chat/.agents/skills/drizzle/SKILL.md` —— Drizzle 风格（snake_case、text id 不用 serial）
- `refs/lobe-chat/.agents/skills/db-migrations/SKILL.md` —— 迁移纪律（生成后不手改）
- `refs/lobe-chat/.agents/skills/zustand/SKILL.md` —— 域状态划分思想（我们起步用组件状态/SWR）

## 简化版做法

1. `lib/db/`：Drizzle + better-sqlite3；两张表：
   - `topics`：id / title / createdAt（标题用首条用户消息自动生成）
   - `messages`：id / topicId / role / content / createdAt
2. `app/api/topics/route.ts`：增删改查。
3. `/api/chat` 每轮对话**写入数据库**（用户消息 + AI 完整回复）。
4. 侧边栏渲染列表；点击切换、新建、删除。

## 纪律

- 表结构变更走 `drizzle-kit generate`，不手改迁移 SQL（开发期可删草稿迁移重新生成）。
- id 用 text + 应用层生成（或 uuid），不用自增 serial。
- 删除会话是破坏性操作：删除前确认；**不要**乐观更新删除。

## 验收（`docs/replica/04` 阶段 2）

- [ ] 刷新不丢；重启服务不丢（数据在 .db 文件里）
- [ ] 删掉的会话查不到
- [ ] 新建会话自动以首条消息为标题

## 常见翻车

- 重启数据没了 → 数据没落库，只在内存/组件状态里；检查 `/api/chat` 的写入代码。
- 列表不更新 → 写库后没有重新获取；刷新列表缓存或让查询失效。
