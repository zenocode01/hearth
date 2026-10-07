import { desc } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { topics } from '@/lib/db/schema';

/** GET /api/topics —— 会话列表（最近更新的在前）。 */
export function GET() {
  const rows = getDb().select().from(topics).orderBy(desc(topics.updatedAt)).all();
  return Response.json({ topics: rows });
}

/** POST /api/topics —— 新建会话（标题取首条消息前 40 字，可带 Agent）。 */
export async function POST(req: Request) {
  const { title, agentId } = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    title?: string;
  };
  const now = new Date();
  const topic = {
    agentId: agentId?.trim() || null,
    createdAt: now,
    id: createId('top'),
    title: (title?.trim() || '新对话').slice(0, 40),
    updatedAt: now,
  };

  getDb().insert(topics).values(topic).run();
  return Response.json({ topic });
}
