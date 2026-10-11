import type { UIMessage } from 'ai';
import { asc, desc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { messages as messagesTable, topics } from '@/lib/db/schema';

/**
 * 聊天输入框里 `@会话` 引用的另一个会话：读它的最近内容，拼成一段参考文本发给模型。
 * 与附件同一套取舍：**只有当前轮**会把引用内容发给模型（历史里只剩输入框里那串 `@标题`）。
 */

export interface TopicReference {
  id: string;
  type: 'topic';
}

/** 每段引用最多带多少字 / 整轮引用合计上限（引用是补充，不该挤掉正常对话） */
const PER_REF_BUDGET = 2000;
const TOTAL_BUDGET = 6000;
/** 每段引用最多回看多少条消息 */
const MAX_MESSAGES = 20;

const HEADER = '用户引用了其他会话的内容（仅作参考，不属于当前会话的历史）：';

/** 校验请求体里的 references（坏数据一律丢掉，不影响这轮聊天）。 */
export function parseTopicReferences(input: unknown): TopicReference[] {
  if (!Array.isArray(input)) return [];
  const refs: TopicReference[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { id?: unknown; type?: unknown };
    if (item.type !== 'topic') continue;
    if (typeof item.id !== 'string' || !item.id.trim()) continue;
    if (refs.some((ref) => ref.id === item.id)) continue;
    refs.push({ id: item.id, type: 'topic' });
  }
  return refs;
}

/** 被引用的会话 → `<referenced_topic>` 文本块；读不到 / 没内容就跳过。 */
export function buildTopicReferences(
  refs: TopicReference[],
  options: { excludeTopicId?: string | null } = {},
): string {
  if (refs.length === 0) return '';
  const db = getDb();
  const blocks: string[] = [];
  let budget = TOTAL_BUDGET;

  for (const ref of refs) {
    // 引用自己没意义（客户端也会过滤，这里再兜一层）
    if (ref.id === options.excludeTopicId) continue;
    const topic = db.select().from(topics).where(eq(topics.id, ref.id)).get();
    if (!topic) continue;

    // 取最近 N 条再翻回时间顺序（要的是"最近说了什么"）
    const rows = db
      .select({ content: messagesTable.content, role: messagesTable.role })
      .from(messagesTable)
      .where(eq(messagesTable.topicId, ref.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(MAX_MESSAGES)
      .all()
      .reverse();

    let body = rows
      .filter((row) => row.content.trim())
      .map((row) => `${row.role === 'user' ? '用户' : '助手'}：${row.content.trim()}`)
      .join('\n');
    if (!body) continue;

    // 太长就砍头留尾（近的比远的更有用），并明确告诉模型前面被略过
    const cap = Math.min(PER_REF_BUDGET, budget);
    if (body.length > cap) body = `（前文略）\n${body.slice(body.length - cap)}`;
    if (body.length > budget) break;

    const block = `<referenced_topic title="${topic.title}">\n${body}\n</referenced_topic>`;
    blocks.push(block);
    budget -= block.length;
  }

  return blocks.length > 0 ? `${HEADER}\n\n${blocks.join('\n\n')}` : '';
}

/**
 * 把引用块拼进**最后一条用户消息**（内置模型分支用）。
 * 只改发给模型的那份，落库的仍是用户原文；返回新数组，不动入参。
 */
export function withReferences(messages: UIMessage[], block: string): UIMessage[] {
  if (!block || messages.length === 0) return messages;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const parts = [...message.parts];
    const lastText = parts.map((part) => part.type).lastIndexOf('text');
    if (lastText >= 0) {
      const part = parts[lastText] as { text: string; type: 'text' };
      parts[lastText] = { ...part, text: `${block}\n\n${part.text}` };
    } else {
      parts.push({ text: block, type: 'text' } as UIMessage['parts'][number]);
    }
    const next = [...messages];
    next[i] = { ...message, parts };
    return next;
  }
  return messages;
}
