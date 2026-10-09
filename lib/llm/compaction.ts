/**
 * 上下文压缩：会话历史太长时，把**旧消息**压成一段摘要，只把「摘要 + 最近几轮原文」发给模型。
 *
 * 三条设计约定（地基见 lib/llm/contextBudget.ts、表见 lib/db/schema.ts 的 topic_summaries）：
 *
 * 1. **原消息不删**。压缩只影响"发给模型的那份"，UI 里历史仍然完整可看。
 * 2. **摘要是滚动的**：新摘要 = 旧摘要 + 未覆盖的新历史 再压一次；每次压都往 topic_summaries
 *    插一条新记录（水位线 `throughMessageId` 决定下次从哪条消息开始压）。
 * 3. **判定点在"调模型之前"**（不是每 N 轮查一次）——一条超大的工具结果就能炸穿上下文。
 *
 * 只用于内置模型（api）分支。pi 有自己的 compaction，别重复造（见 docs/HANDOFF.md §3）。
 */
import { generateText, type LanguageModel, type UIMessage } from 'ai';
import { asc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { deserializeParts, parseStoredParts } from '@/lib/db/messageParts';
import { messages as messagesTable, topicSummaries } from '@/lib/db/schema';
import type { ChatMessage, TopicSummary } from '@/lib/db/schema';
import { getLatestSummary, insertSummary, listSummaries } from '@/lib/db/topicSummaries';
import {
  COMPRESS_TOKEN_LIMIT,
  KEEP_RECENT_TURNS,
  decideCompression,
  estimateMessagesTokens,
  estimateTokens,
} from '@/lib/llm/contextBudget';

/** 摘要正文长度上限（字符）：摘要本身太长就等于没压 */
const SUMMARY_MAX_CHARS = 4_000;
/** 喂给摘要模型的原文上限（字符）：超出直接截断，宁可丢细节也别把压缩这一步撑爆 */
const TRANSCRIPT_MAX_CHARS = 24_000;
/** 工具结果进摘要时的截断长度 */
const TOOL_OUTPUT_CHARS = 300;

export interface PreparedContext {
  /** 本次实际发给模型的消息（已剔除被摘要覆盖的旧消息） */
  messages: UIMessage[];
  /** 摘要正文（调用方拼进 instructions）；null = 没有摘要 */
  summary: string | null;
  /** 本次是否新压了一段（UI 提示与日志用） */
  compacted: boolean;
  /** 本次压掉的消息条数 */
  compressedCount: number;
  /** 压缩前的 token 估算（含已有摘要） */
  estimatedTokens: number;
  /** 本次用的阈值（有摘要时是迟滞后的水位） */
  threshold: number;
  /** 压缩失败原因（失败不影响正常对话，只是历史照旧全量发送） */
  error: string | null;
}

function safeJson(value: unknown): string {
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * 一条 UI 消息 → 摘要模型的原文。
 *
 * 刻意**不带 reasoning**：思考过程对后续对话几乎没有复用价值，却最占篇幅——
 * 把它喂给摘要模型，等于花钱压缩一段本来就打算扔掉的东西。
 */
function transcriptOf(message: UIMessage): string {
  const bits: string[] = [];
  for (const part of message.parts) {
    if (part.type === 'text') {
      const text = part.text.trim();
      if (text) bits.push(text);
      continue;
    }
    if (part.type === 'file') {
      const file = part as { filename?: string };
      bits.push(`[附件：${file.filename ?? '未命名'}]`);
      continue;
    }
    if (part.type === 'reasoning') continue;
    // tool-* / dynamic-tool：留工具名 + 结果摘要，模型据此知道"当时查过什么"
    const tool = part as { errorText?: string; output?: unknown; toolName?: string };
    if (tool.toolName) {
      const out = safeJson(tool.output).slice(0, TOOL_OUTPUT_CHARS);
      bits.push(`[工具 ${tool.toolName}${tool.errorText ? ' 失败' : ''}] ${out}`);
    }
  }
  return bits.join('\n');
}

/** 一组消息 → "用户：… / 助手：…" 的纯文本，超长截断。 */
function renderTranscript(messages: UIMessage[]): string {
  const lines = messages.map(
    (message) => `${message.role === 'user' ? '用户' : '助手'}：${transcriptOf(message)}`,
  );
  const text = lines.filter((line) => line.includes('：')).join('\n\n');
  if (text.length <= TRANSCRIPT_MAX_CHARS) return text;
  return `${text.slice(0, TRANSCRIPT_MAX_CHARS)}\n…（原文过长，此处截断）`;
}

/**
 * 保留最近几轮：从后往前数第 keepTurns 条 user 消息就是切点（它及之后全部保留原文）。
 *
 * 兜底：轮次不够（比如只有一轮，但那条工具结果巨大）时退回"至少留最后 2 条"，
 * 否则 older 为空、再超限也没法压。
 */
export function keepRecentStart(messages: UIMessage[], keepTurns: number): number {
  const userStarts: number[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') userStarts.push(index);
  }
  if (userStarts.length > keepTurns) return userStarts[userStarts.length - keepTurns];
  return Math.max(0, messages.length - 2);
}

/**
 * 摘要覆盖到哪：返回第一条**未被覆盖**的消息下标。
 *
 * 水位线指向的消息已经不在了（删过消息）→ 返回 0：旧摘要作废，从头重压。
 * 重复计费一点点，但不会把"已经不在上下文里的东西"当成有效记忆。
 */
function coveredThroughIndex(messages: UIMessage[], summary: TopicSummary | null): number {
  if (!summary) return 0;
  const index = messages.findIndex((message) => message.id === summary.throughMessageId);
  return index < 0 ? 0 : index + 1;
}

/**
 * 摘要提示词——**学 pi 的 compaction 方法**（pi 的 `SUMMARIZATION_SYSTEM_PROMPT` /
 * `SUMMARIZATION_PROMPT` / `UPDATE_SUMMARIZATION_INSTRUCTIONS`，见其 bundle）：
 * 输出结构化 checkpoint，让另一个 LLM 能据此接着干；带旧摘要时走"更新"指令，
 * 保留已有信息、把进行中移入已完成。分段用中文表头，便于用户在 ContextMeter 里直接读。
 */
const SUMMARY_SYSTEM = [
  '你是一个上下文压缩助手。读一段用户与 AI 助手的对话，按指定格式产出结构化摘要。',
  '不要继续这段对话，不要回答其中的任何问题，只输出摘要本身。',
].join('\n');

/** 首次压缩用的格式（对应 pi 的 SUMMARIZATION_PROMPT）。 */
const SUMMARY_FORMAT = [
  '把上面的对话压成一份结构化的「上下文 checkpoint」，供另一个 LLM 据此继续工作。',
  '严格用以下格式：',
  '## 目标',
  '[用户想达成什么？可能有多项]',
  '## 约束与偏好',
  '- [用户提出的约束/偏好；没有就写"（无）"]',
  '## 进度',
  '### 已完成',
  '- [x] [已完成的事]',
  '### 进行中',
  '- [ ] [当前在做的事]',
  '### 受阻',
  '- [阻塞项，若有]',
  '## 关键决策',
  '- **[决策]**：[简要理由]',
  '## 下一步',
  '1. [接下来该做什么，按顺序]',
  '## 关键上下文',
  '- [继续工作所需的数据/示例/引用；没有就写"（无）"]',
  '每节保持精简。**必须原样保留**文件路径、函数名、标识符与报错原文。',
].join('\n');

/** 滚动压缩：把新历史并入旧摘要（对应 pi 的 UPDATE_SUMMARIZATION_INSTRUCTIONS）。 */
const SUMMARY_UPDATE = [
  '把新的对话消息并入 <previous-summary> 里的既有摘要。规则：',
  '- 保留既有摘要里的全部信息；',
  '- 补充新消息里的进度、决策与上下文；',
  '- 更新「进度」：完成的事项从「进行中」移到「已完成」；',
  '- 依据已完成的工作更新「下一步」；',
  '- **必须原样保留**文件路径、函数名与报错原文；',
  '- 已不再相关的内容可以删掉。',
  '',
  '严格沿用同一套格式（## 目标 / ## 约束与偏好 / ## 进度 / ## 关键决策 / ## 下一步 / ## 关键上下文）。',
].join('\n');

/** 调模型生成摘要（滚动：带上旧摘要让它合并）。 */
async function summarize(input: {
  model: LanguageModel;
  older: UIMessage[];
  previous: string | null;
}): Promise<string> {
  const conversation = renderTranscript(input.older);
  const instruction = input.previous
    ? `下面的对话是**新增**的历史，请并入 <previous-summary> 里的既有摘要。\n\n${SUMMARY_UPDATE}`
    : SUMMARY_FORMAT;
  const prompt = [
    instruction,
    input.previous ? `<previous-summary>\n${input.previous}\n</previous-summary>` : '',
    `<conversation>\n${conversation}\n</conversation>`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const { text } = await generateText({
    maxOutputTokens: 4_096,
    model: input.model,
    prompt,
    system: SUMMARY_SYSTEM,
  });
  return text.trim().slice(0, SUMMARY_MAX_CHARS);
}

/**
 * 聊天路由的唯一入口：判定 → （必要时）压缩 → 返回该发给模型的东西。
 *
 * 失败一律降级成"照旧全量发送"：压缩是优化，不能因为它把正常对话弄挂。
 * @param force 手动压缩（对应 UI 上的「立即压缩」），跳过阈值判定
 */
export async function prepareContext(input: {
  force?: boolean;
  messages: UIMessage[];
  model: LanguageModel;
  topicId?: string | null;
}): Promise<PreparedContext> {
  const { messages, model, topicId } = input;
  const summary = topicId ? getLatestSummary(topicId) : null;
  const covered = coveredThroughIndex(messages, summary);
  const active = messages.slice(covered);

  // 估算 = 未覆盖的历史 + 摘要自身（摘要也要进上下文）
  const estimated = estimateActiveTokens(active, summary);
  const decision = decideCompression({
    estimatedTokens: estimated,
    force: input.force,
    hasSummary: Boolean(summary),
  });

  const base = {
    compacted: false,
    compressedCount: 0,
    error: null,
    estimatedTokens: estimated,
    messages: active,
    summary: summary?.content ?? null,
    threshold: decision.threshold,
  };

  if (!decision.needsCompression) return base;

  const keepStart = keepRecentStart(messages, decision.keepRecentTurns);
  const older = messages.slice(covered, keepStart);
  if (older.length === 0) {
    // 已经没什么可压的了（最近几轮本身就超限）：只能靠模型自己的窗口，别空转
    return base;
  }

  try {
    const content = await summarize({ model, older, previous: summary?.content ?? null });
    if (!content) return { ...base, error: '摘要为空' };

    if (topicId) {
      insertSummary({
        compressedCount: older.length,
        content,
        throughMessageId: older[older.length - 1].id,
        tokenCount: estimateMessagesTokens(older),
        topicId,
      });
    }

    return {
      compacted: true,
      compressedCount: older.length,
      error: null,
      estimatedTokens: estimated,
      messages: messages.slice(keepStart),
      summary: content,
      threshold: decision.threshold,
    };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 未覆盖历史的 token 估算 + 摘要自身（摘要也要占窗口，不能不算）。 */
function estimateActiveTokens(messages: UIMessage[], summary: TopicSummary | null): number {
  return estimateMessagesTokens(messages) + (summary ? estimateTokens(summary.content) : 0);
}

/**
 * 库里的会话历史 → UIMessage[]（手动压缩与上下文统计用）。
 * 与客户端加载历史同一套兜底：有 parts 用 parts，老数据回落到 content + reasoning。
 */
export function loadTopicMessages(topicId: string): UIMessage[] {
  const rows = getDb()
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.topicId, topicId))
    .orderBy(asc(messagesTable.createdAt))
    .all();

  return rows.map((row: ChatMessage) => {
    const stored = parseStoredParts(row.parts);
    const parts: UIMessage['parts'] = stored
      ? deserializeParts(stored)
      : [
          ...(row.reasoning ? [{ text: row.reasoning, type: 'reasoning' as const }] : []),
          ...(row.content ? [{ text: row.content, type: 'text' as const }] : []),
        ];
    return { id: row.id, parts, role: row.role } as UIMessage;
  });
}

/** 给 UI 的上下文占用读数（chip 与 Popover 用）。 */
export function topicContextStats(topicId: string) {
  const history = loadTopicMessages(topicId);
  const summary = getLatestSummary(topicId);
  const summaries = listSummaries(topicId);

  return {
    estimatedTokens: estimateActiveTokens(history.slice(coveredThroughIndex(history, summary)), summary),
    // 阈值与聊天路由判定同源：有摘要时是迟滞后的水位
    threshold: decideCompression({
      estimatedTokens: 0,
      hasSummary: Boolean(summary),
    }).threshold,
    keepRecentTurns: KEEP_RECENT_TURNS,
    limit: COMPRESS_TOKEN_LIMIT,
    messageCount: history.length,
    summaryCount: summaries.length,
    summaries: summaries.slice(0, 5).map((item) => ({
      compressedCount: item.compressedCount,
      content: item.content,
      createdAt: item.createdAt,
      tokenCount: item.tokenCount,
    })),
  };
}

/** 把摘要拼进 instructions（v7 不让 messages 里放 system 消息，摘要只能走这条口）。 */
export function withSummaryInstruction(systemPrompt: string | null | undefined, summary: string | null): string | undefined {
  const parts = [
    systemPrompt?.trim(),
    // 学 pi 的注入措辞：一句话说明"前面被压缩了"，再给 <summary> 本体
    summary ? `此前的对话历史已压缩成以下摘要：\n<summary>\n${summary}\n</summary>` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}
