import { asc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { messages, topics } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

/**
 * POST —— 从某条消息处派生一个分支会话：
 * 新建 topic，并把原会话中"到这条消息为止"的内容复制过去（原会话不受影响）。
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { messageId } = (await req.json().catch(() => ({}))) as { messageId?: string };
  if (!messageId) return Response.json({ error: '缺少 messageId' }, { status: 400 });

  const db = getDb();
  const source = db.select().from(topics).where(eq(topics.id, id)).get();
  if (!source) return Response.json({ error: '会话不存在' }, { status: 404 });

  // 按时间正序取全部消息，再切到目标消息为止（比按时间比较更稳）
  const all = db
    .select()
    .from(messages)
    .where(eq(messages.topicId, id))
    .orderBy(asc(messages.createdAt))
    .all();
  const index = all.findIndex((row) => row.id === messageId);
  if (index < 0) return Response.json({ error: '消息不存在' }, { status: 400 });

  const now = new Date();
  const topic = {
    createdAt: now,
    id: createId('top'),
    title: `${source.title} · 分支`,
    updatedAt: now,
  };

  db.insert(topics).values(topic).run();
  for (const row of all.slice(0, index + 1)) {
    db.insert(messages)
      .values({
        content: row.content,
        createdAt: row.createdAt,
        id: createId('msg'),
        reasoning: row.reasoning,
        reasoningMs: row.reasoningMs,
        role: row.role,
        topicId: topic.id,
      })
      .run();
  }

  return Response.json({ topic });
}
