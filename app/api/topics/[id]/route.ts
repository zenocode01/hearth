import { asc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { agents, messages, topics } from '@/lib/db/schema';
import { readPiBranchMessages } from '@/lib/llm/piBranch';
import { isPiCommand, isPiRpcCommand } from '@/lib/llm/piCommand';
import { normalizeReasoningEffort } from '@/lib/llm/reasoning';
import { parseToolSettings } from '@/lib/tools/settings';

type Params = { params: Promise<{ id: string }> };

/** 该会话是不是 pi（RPC）主题：是的话对话按 pi 的当前分支渲染。 */
function isPiTopic(topic: { agentId?: string | null } | null): boolean {
  if (!topic?.agentId) return false;
  const agent = getDb().select().from(agents).where(eq(agents.id, topic.agentId)).get();
  return (
    agent?.runtime === 'cli' && isPiCommand(agent.cliCommand) && isPiRpcCommand(agent.cliCommand)
  );
}

/** GET —— 单个会话 + 它的消息（按时间正序；pi 主题返回**当前分支**的消息）。 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();

  const topic = db.select().from(topics).where(eq(topics.id, id)).get();
  if (!topic) return Response.json({ error: '会话不存在' }, { status: 404 });

  // pi 主题：pi 管历史，DB 只是线性镜像（含所有分支）。这里按 pi 的当前 leaf 还原对话，
  // 于是切分支后重载就能看到该分支的消息。读不到（非隔离/没有会话）就回退 DB 行。
  if (isPiTopic(topic)) {
    const branch = readPiBranchMessages(id);
    if (branch) {
      return Response.json({
        messages: branch.map((item) => ({
          content: '',
          id: item.id,
          parts: JSON.stringify(item.parts),
          reasoning: null,
          reasoningMs: null,
          role: item.role,
        })),
        topic,
      });
    }
  }

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.topicId, id))
    .orderBy(asc(messages.createdAt))
    .all();

  return Response.json({ messages: rows, topic });
}

/** PATCH —— 改名 / 换 Agent / 工具开关 / 思考等级。 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { title, agentId, reasoningEffort, tools } = (await req.json().catch(() => ({}))) as {
    agentId?: string | null;
    reasoningEffort?: string | null;
    title?: string;
    tools?: unknown;
  };

  const patch: {
    agentId?: string | null;
    reasoningEffort?: string | null;
    title?: string;
    tools?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (typeof title === 'string') {
    const clean = title.trim();
    if (!clean) return Response.json({ error: '标题不能为空' }, { status: 400 });
    patch.title = clean.slice(0, 80);
  }
  if (agentId !== undefined) {
    patch.agentId = agentId?.trim() || null;
  }
  if (reasoningEffort !== undefined) {
    // 传 null = 恢复"跟随 Agent"；非法档位同样归 null
    patch.reasoningEffort = normalizeReasoningEffort(reasoningEffort);
  }
  if (tools !== undefined) {
    // 工具开关：存 `[{ name, mode }]`；传 null 表示恢复"全部自动启用"
    const settings = parseToolSettings(tools === null ? null : JSON.stringify(tools));
    patch.tools = settings && settings.length > 0 ? JSON.stringify(settings) : null;
  }

  getDb().update(topics).set(patch).where(eq(topics.id, id)).run();

  return Response.json({ ok: true });
}

/** DELETE —— 删除会话（消息表外键级联删除）。 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  getDb().delete(topics).where(eq(topics.id, id)).run();
  return Response.json({ ok: true });
}
