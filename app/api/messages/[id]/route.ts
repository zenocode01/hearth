import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { messages } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

/** DELETE —— 删除单条消息（按消息 id）。 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  getDb().delete(messages).where(eq(messages.id, id)).run();
  return Response.json({ ok: true });
}
