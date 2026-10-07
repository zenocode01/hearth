---
name: topics-persistence
description: 'Use for SQLite + Drizzle setup, topics/messages schema, session CRUD, migrations and the sidebar. Blueprint L1-2, roadmap phase 2.'
---

# 会话持久化（L1-2）

已落地（阶段 2）：刷新/重启不丢；侧栏可新建 / 切换 / 改名 / 删除。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/packages/database/src/schemas/` —— topics/messages 表字段（只取需要的列）
- `refs/lobe-chat/.agents/skills/drizzle/SKILL.md` —— Drizzle 风格（snake_case、text id、不用 pg enum）
- `refs/lobe-chat/.agents/skills/db-migrations/SKILL.md` —— 迁移纪律（生成后不手改）

## 已落地结构

- **表**：`lib/db/schema.ts` —— `topics(id, title, created_at, updated_at)`、`messages(id, topic_id→topics 级联删除, role, content, created_at)`，附 `(topic_id, created_at)` 索引。
- **连接 + 自动迁移**：`lib/db/index.ts`，单例（`globalThis` 缓存，避免 dev 热重载重复开连接）；首次 `getDb()` 时 `migrate()`，**npm run dev 无需手动步骤**。
- **迁移**：`lib/db/migrations/`（`npm run db:generate` 生成；`npm run db:studio` 查看）。文件名重命名为有意义的名字并同步 `_journal.json` 的 `tag`。
- **API**：`GET/POST /api/topics`、`GET/PATCH/DELETE /api/topics/[id]`。
- **聊天落库**（`app/api/chat/route.ts`）：请求里带 `topicId`；用户消息按 `id` `onConflictDoNothing` 去重写入；AI 回复在 `streamText({ onEnd })` 里写库并更新 topic 的 `updatedAt`。落库失败只 `console.error`，不能影响聊天流。
- **前端**：`features/chat/TopicSidebar.tsx`（新建/切换/改名/删除，删除两段确认、不做乐观删除）；`ChatView` 负责 `?topic=` URL 同步、切换时加载历史、首次发送前先建 topic。

## 关键坑（都踩过）

- **`process.cwd()` 不一定是项目根**：Next 的服务器进程里 cwd 可能指向 `.next` 内部，直接 `path.join(process.cwd(), 'lib/db/migrations')` 会报 `Can't find meta/_journal.json`。解法：从 cwd 逐级向上找带 `package.json` 的目录作为项目根，并对迁移目录再做一次向上兜底查找。
- **`better-sqlite3` 是原生模块**：npm 12 默认拦截安装脚本（`node-gyp rebuild` 被 block），需 `npm install-scripts approve better-sqlite3` 后 `npm rebuild`，否则运行时报模块加载失败。
- **drizzle-kit 会先建空库文件**：`generate` 之后 `data/app.db` 可能已存在但没有表——不要用手动建的库判断"迁移已生效"。
- **建会话与发消息的竞态**：新建会话时若先 `setActiveTopicId`，历史加载 effect 会把刚发出的消息清空。用 `skipHistoryForRef` 跳过这一次历史加载。
- **推理过程不入库**（阶段 2 简化）：只存文本 `content`；刷新后推理块消失属预期。

## 验收（`docs/replica/04` 阶段 2）

- [x] 刷新不丢（重载后消息从库里恢复）
- [x] 重启服务不丢（数据在 `data/app.db`）
- [x] 删掉的会话查不到（级联删除已验证：topics 0 / messages 0）
- [x] 侧栏：新建 / 切换 / 改名 / 删除
