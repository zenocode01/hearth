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
- **推理过程也要入库**（否则刷新后思考内容消失，与 LobeHub 不一致）：`messages` 表有 `reasoning`（文本）与 `reasoning_ms`（耗时）。写入点在 `toUIMessageStream({ onEnd: ({ responseMessage }) => ... })` —— 只有这里能拿到**组装好的 `responseMessage.parts`**（含 `text` 与 `reasoning` 两类 part）；`streamText.onEnd` 只有正文文本。历史消息在 `ChatView` 里还原为 `[reasoning part, text part]`，耗时经 `message.metadata.reasoningMs` 传给 `ReasoningBlock` 的 `durationMs`。
- **新迁移要重启 dev**：`migrate()` 只在建立新连接时执行，而 dev 进程把连接缓存在 `globalThis`；加列后不重启会出现 `no such column`。重启即自动补跑迁移。

## 消息操作（复制 / 放回输入框 / 重新生成 / 删除）

参考 LobeHub 的 `Conversation/Messages/components/MessageActionBar`，取常用动作实现于 `features/chat/MessageActions.tsx`：

- 用 `@lobehub/ui` 的 **`ActionIconGroup`**（items：`{ key, label, icon, disabled, danger }`）+ `copyToClipboard` + `toast`。
- **`toast` 需要在根节点挂 `ToastHost`**（`components/AppThemeProvider.tsx` 里已挂 `<ToastHost />`），否则不会有任何提示。
- 悬停显示：`.pi-msg:hover .pi-msg-actions`（触屏用 `@media (hover: none)` 常显）。

### 关键坑：消息 id 必须两端一致

删除 / 重新生成都**按消息 id 匹配**（`DELETE /api/messages/[id]`、`regenerate({ messageId })`），所以落库的 id 必须等于客户端内存里的 id：

```ts
toUIMessageStream({
  originalMessages: uiMessages,          // 进入"持久化模式"
  generateMessageId: () => createId('msg'), // ← 必须给！只传 originalMessages 时响应消息 id 是 undefined
  onEnd: ({ responseMessage }) => { /* 用 responseMessage.id 落库 */ },
})
```

该 id 会随流下发给客户端，两端自然一致。**只传 `originalMessages` 不给 `generateMessageId`** 时 `responseMessage.id` 为 `undefined`，落库走兜底 id → 与客户端不一致 → 删除/重新生成静默失效（UI 看着删了，刷新又回来）。

- **重新生成的顺序**：先 `await` 旧回复的 DELETE，再 `regenerate()`；并发会导致库里留下两条。

### 分支（从消息派生新会话）

LobeHub 的"分支"是从消息开一个 thread；我们的等价实现：`POST /api/topics/[id]/branch { messageId }` —— 把该会话**到这条消息为止**的内容复制进一个新 topic（标题 `原标题 · 分支`，消息用新 id，保留 `reasoning` / `reasoning_ms` / `createdAt`），客户端创建后切过去。

- **截断要按下标、不要按时间**：先按 `createdAt` 正序取全部消息，再 `slice(0, index + 1)`；用 `lte(createdAt)` 会在同毫秒的消息上多带。

## 验收（`docs/replica/04` 阶段 2）

- [x] 刷新不丢（重载后消息从库里恢复）
- [x] 重启服务不丢（数据在 `data/app.db`）
- [x] 删掉的会话查不到（级联删除已验证：topics 0 / messages 0）
- [x] 侧栏：新建 / 切换 / 改名 / 删除
