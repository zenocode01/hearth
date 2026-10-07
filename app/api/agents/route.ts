import { desc } from 'drizzle-orm';

import { normalizeAgentInput, type AgentInput } from '@/lib/agents/normalize';
import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { agents } from '@/lib/db/schema';

/** GET /api/agents —— Agent 列表（最近更新的在前）。 */
export function GET() {
  const rows = getDb().select().from(agents).orderBy(desc(agents.updatedAt)).all();
  return Response.json({ agents: rows });
}

/** POST /api/agents —— 新建 Agent。 */
export async function POST(req: Request) {
  const input = normalizeAgentInput((await req.json().catch(() => ({}))) as AgentInput);
  const now = new Date();
  const agent = { ...input, createdAt: now, id: createId('agt'), updatedAt: now };

  getDb().insert(agents).values(agent).run();
  return Response.json({ agent });
}
