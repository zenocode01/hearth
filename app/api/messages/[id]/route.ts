import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { parseStoredParts } from '@/lib/db/messageParts';
import { messages } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

/** DELETE —— 删除单条消息（按消息 id）。 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  getDb().delete(messages).where(eq(messages.id, id)).run();
  return Response.json({ ok: true });
}

/**
 * PATCH —— 改一条消息的正文（编辑用户消息用）。
 * 只改文本，**保留附件**（file 片段原样留下）；思考/工具片段不适用于用户消息，忽略。
 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { content } = (await req.json().catch(() => ({}))) as { content?: unknown };
  if (typeof content !== 'string' || !content.trim()) {
    return Response.json({ error: '内容不能为空' }, { status: 400 });
  }
  const text = content.trim();

  const db = getDb();
  const existing = db.select().from(messages).where(eq(messages.id, id)).get();
  if (!existing) return Response.json({ error: '消息不存在' }, { status: 404 });

  const files = (parseStoredParts(existing.parts) ?? []).filter((part) => part.type === 'file');
  const parts = [{ text, type: 'text' as const }, ...files];

  db.update(messages)
    .set({ content: text, parts: JSON.stringify(parts) })
    .where(eq(messages.id, id))
    .run();

  return Response.json({ ok: true });
}
