import { eq } from 'drizzle-orm';

import { normalizeAgentPatch, type AgentInput } from '@/lib/agents/normalize';
import { getDb } from '@/lib/db';
import { agents } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

/** GET —— 单个 Agent。 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = getDb().select().from(agents).where(eq(agents.id, id)).get();
  if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 });
  return Response.json({ agent });
}

/** PATCH —— 更新 Agent（人设改动立即生效：聊天时按 id 实时读取）。 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const input = normalizeAgentPatch((await req.json().catch(() => ({}))) as AgentInput);

  getDb()
    .update(agents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .run();

  return Response.json({ ok: true });
}

/** DELETE —— 删除 Agent（其会话的 agent_id 置空，回到默认）。 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  getDb().delete(agents).where(eq(agents.id, id)).run();
  return Response.json({ ok: true });
}
