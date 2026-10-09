import { and, desc, eq, lt } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { messages as messagesTable, topicSummaries, type TopicSummary } from '@/lib/db/schema';

/** 某个会话最新的那条摘要（没有则 null）。 */
export function getLatestSummary(topicId: string): TopicSummary | null {
  const db = getDb();
  return (
    db
      .select()
      .from(topicSummaries)
      .where(eq(topicSummaries.topicId, topicId))
      .orderBy(desc(topicSummaries.createdAt))
      .limit(1)
      .get() ?? null
  );
}

/** 某个会话的全部摘要（新 → 旧），UI 展示与调试用。 */
export function listSummaries(topicId: string): TopicSummary[] {
  const db = getDb();
  return db
    .select()
    .from(topicSummaries)
    .where(eq(topicSummaries.topicId, topicId))
    .orderBy(desc(topicSummaries.createdAt))
    .all();
}

/** 写一条新摘要（滚动摘要：每次都写一条新的，历史留着可回看）。 */
export function insertSummary(input: {
  compressedCount: number;
  content: string;
  throughMessageId: string;
  tokenCount?: number;
  topicId: string;
}): TopicSummary {
  const db = getDb();
  const row: TopicSummary = {
    compressedCount: input.compressedCount,
    content: input.content,
    createdAt: new Date(),
    id: createId('sum'),
    throughMessageId: input.throughMessageId,
    tokenCount: input.tokenCount ?? null,
    topicId: input.topicId,
  };
  db.insert(topicSummaries).values(row).run();
  return row;
}

/**
 * 删掉某条消息之后的所有摘要（删消息/分支回退后调用，避免水位线指向不存在的消息）。
 * 返回删了几条。
 */
export function deleteSummariesAfter(topicId: string, messageId: string): number {
  const db = getDb();
  // 找到 messageId 的位置，删它之前的摘要（更早的摘要不再有效）
  const target = db
    .select({ createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(and(eq(messagesTable.id, messageId), eq(messagesTable.topicId, topicId)))
    .get();
  if (!target) return 0;
  const rows = db
    .select()
    .from(topicSummaries)
    .where(and(eq(topicSummaries.topicId, topicId), lt(topicSummaries.createdAt, target.createdAt)))
    .all();
  if (rows.length === 0) return 0;
  db.delete(topicSummaries)
    .where(
      and(
        eq(topicSummaries.topicId, topicId),
        lt(topicSummaries.createdAt, target.createdAt),
      ),
    )
    .run();
  return rows.length;
}

/**
 * 撤销最近一次压缩：删掉最新那条摘要，水位线自动回退到上一条（或没有）。
 * 返回是否删掉了（没有摘要时为 false）。
 *
 * 语义上等价于"把这次压缩退回"——下一次请求会把这段历史重新发给模型（可能再次被压）。
 */
export function deleteLatestSummary(topicId: string): boolean {
  const latest = getLatestSummary(topicId);
  if (!latest) return false;
  getDb().delete(topicSummaries).where(eq(topicSummaries.id, latest.id)).run();
  return true;
}
