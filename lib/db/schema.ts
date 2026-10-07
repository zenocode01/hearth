import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Agent（"AI 员工"）：人设 / 头像 / 模型 / 温度。 */
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** 头像：一个 emoji（用 FluentEmoji 渲染） */
  avatar: text('avatar'),
  /** 头像背景色（可空，渲染成带底色的小方块） */
  backgroundColor: text('background_color'),
  /** 人设（系统提示词） */
  systemPrompt: text('system_prompt'),
  /** 模型名；空 = 用 .env.local 里的默认模型 */
  model: text('model'),
  /** 温度；空 = 用接口默认 */
  temperature: real('temperature'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 会话（话题）表：一条对话一个 topic。 */
export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** 该会话使用的 Agent；Agent 删除后置空（回到默认） */
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
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

export type Agent = typeof agents.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type ChatMessage = typeof messages.$inferSelect;
