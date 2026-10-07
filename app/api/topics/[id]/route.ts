import { asc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { messages, topics } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

/** GET —— 单个会话 + 它的全部消息（按时间正序）。 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  const topic = db.select().from(topics).where(eq(topics.id, id)).get();
  if (!topic) return Response.json({ error: '会话不存在' }, { status: 404 });

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.topicId, id))
    .orderBy(asc(messages.createdAt))
    .all();

  return Response.json({ messages: rows, topic });
}

/** PATCH —— 改名。 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { title } = (await req.json().catch(() => ({}))) as { title?: string };
  const clean = String(title ?? '').trim();
  if (!clean) return Response.json({ error: '标题不能为空' }, { status: 400 });

  getDb()
    .update(topics)
    .set({ title: clean.slice(0, 80), updatedAt: new Date() })
    .where(eq(topics.id, id))
    .run();

  return Response.json({ ok: true });
}

/** DELETE —— 删除会话（消息表外键级联删除）。 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  getDb().delete(topics).where(eq(topics.id, id)).run();
  return Response.json({ ok: true });
}
