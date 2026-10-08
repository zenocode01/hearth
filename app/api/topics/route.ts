import { desc } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { topics } from '@/lib/db/schema';
import { parseToolSettings } from '@/lib/tools/settings';

/** GET /api/topics —— 会话列表（最近更新的在前）。 */
export function GET() {
  const rows = getDb().select().from(topics).orderBy(desc(topics.updatedAt)).all();
  return Response.json({ topics: rows });
}

/** POST /api/topics —— 新建会话（标题取首条消息前 40 字，可带 Agent 与工具开关）。 */
export async function POST(req: Request) {
  const { title, agentId, tools } = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    title?: string;
    tools?: unknown;
  };
  const now = new Date();
  const settings = parseToolSettings(tools === undefined ? null : JSON.stringify(tools));
  const topic = {
    agentId: agentId?.trim() || null,
    createdAt: now,
    id: createId('top'),
    title: (title?.trim() || '新对话').slice(0, 40),
    tools: settings && settings.length > 0 ? JSON.stringify(settings) : null,
    updatedAt: now,
  };

  getDb().insert(topics).values(topic).run();
  return Response.json({ topic });
}
