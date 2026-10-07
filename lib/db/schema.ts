import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** 会话（话题）表：一条对话一个 topic。 */
export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 消息表：文本内容 + 推理过程（推理仅 assistant 消息会有）。 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    /** 推理模型的思考过程（可空） */
    reasoning: text('reasoning'),
    /** 思考耗时（毫秒），用于历史消息显示"已深度思考 N 秒" */
    reasoningMs: integer('reasoning_ms'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('messages_topic_id_created_at_idx').on(table.topicId, table.createdAt)],
);

export type Topic = typeof topics.$inferSelect;
export type ChatMessage = typeof messages.$inferSelect;
