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
  /** 运行方式：api = 内置模型接口；cli = 外部 CLI agent（pi / opencode / claude…） */
  runtime: text('runtime').notNull().default('api'),
  /** CLI 命令模板，支持 {{prompt}} 与 {{systemPrompt}} 占位符（不含占位符时 prompt 走 stdin） */
  cliCommand: text('cli_command'),
  /** 模型名；空 = 用 .env.local 里的默认模型（仅 api 方式） */
  model: text('model'),
  /** 温度；空 = 用接口默认（仅 api 方式） */
  temperature: real('temperature'),
  /**
   * 思考等级：off / low / medium / high / xhigh；空 = 让运行方用默认值。
   *
   * 两条链路都支持，但含义不同：
   * - api：进 providerOptions.reasoningEffort（openai-compatible 认这个字段）
   * - cli（pi）：spawn 后发一条 `{"type":"set_thinking_level","level":…}` RPC 命令
   *
   * 差别大到值得单独一列：思考 token 是实打实的钱和时间，
   * 但各档耗时差多少由模型决定（见 lib/llm/reasoning.ts 的实测说明）。
   */
  reasoningEffort: text('reasoning_effort'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/** 会话（话题）表：一条对话一个 topic。 */
export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** 该会话使用的 Agent；Agent 删除后置空（回到默认） */
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  /**
   * 工具开关（JSON）：`[{ name, mode: 'auto' | 'disabled' }]`。
   * 空/未设置 = 全部工具自动启用（与 LobeHub 的"不在列表里 = auto"一致）。
   */
  tools: text('tools'),
  /**
   * 会话级思考等级覆盖（off/low/medium/high/xhigh）。
   * null = 跟随 Agent 的设置；工具栏里切换只改这个，不用动 Agent。
   * 聊天请求里 topic 的值优先于 agent 的值（见 app/api/chat/route.ts）。
   */
  reasoningEffort: text('reasoning_effort'),
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
    /**
     * 完整消息片段（JSON）：text / reasoning / tool 的**有序**数组，
     * 用于刷新后原样恢复工具调用卡片与交错顺序（旧数据为空，按 content + reasoning 兜底）。
     */
    parts: text('parts'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('messages_topic_id_created_at_idx').on(table.topicId, table.createdAt)],
);

export type Agent = typeof agents.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type ChatMessage = typeof messages.$inferSelect;

/**
 * 会话上下文压缩摘要表（2026-10-09）。
 *
 * 为什么单独一张表而不是往 topics 上加一列：压缩是**滚动**的——每压一次就多一段摘要，
 * 一列只能存"最新一段"，历史摘要会丢（也会丢掉"压到哪条消息"的水位线）。
 *
 * 一条记录 = "从会话开头到 `throughMessageId`（含）为止的历史，已被 `content` 概括"。
 * 原消息**不删**，UI 仍可展开查看/撤销；只是发给模型时用摘要替代。
 */
export const topicSummaries = sqliteTable(
  'topic_summaries',
  {
    id: text('id').primaryKey(),
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    /** 摘要正文（滚动：新摘要 = 旧摘要 + 新增历史 再压一次） */
    content: text('content').notNull(),
    /** 水位线：这条摘要覆盖到哪条消息（含）。防重复压缩、也能判断要不要再压 */
    throughMessageId: text('through_message_id').notNull(),
    /** 本次压缩掉的消息条数（UI 展示"已压缩 N 条"） */
    compressedCount: integer('compressed_count').notNull().default(0),
    /** 压缩前的 token 估算（UI 展示 + 调阈值用） */
    tokenCount: integer('token_count'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('topic_summaries_topic_created_at_idx').on(table.topicId, table.createdAt),
  ],
);

export type TopicSummary = typeof topicSummaries.$inferSelect;
