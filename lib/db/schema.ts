import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** 会话（话题）表：一条对话一个 topic。 */
export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 消息表：只存纯文本内容（阶段 2 的简化，推理过程不入库）。 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('messages_topic_id_created_at_idx').on(table.topicId, table.createdAt)],
);

export type Topic = typeof topics.$inferSelect;
export type ChatMessage = typeof messages.$inferSelect;
