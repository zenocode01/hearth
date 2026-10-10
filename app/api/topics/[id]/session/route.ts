import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { agents, topics } from '@/lib/db/schema';
import { isPiRpcCommand, navigatePiSession, readPiSession } from '@/lib/llm/piSession';
import { isPiCommand } from '@/lib/llm/piTools';

type Params = { params: Promise<{ id: string }> };

/**
 * pi 会话的**会话树 / 状态**接口（方案见 docs/analysis/pi-session-tree.md）。
 *
 * pi 主题的历史与树都归 pi 管（topic id = pi session id），所以这里不查 DB 消息，
 * 而是带同一个 `--session-id` 起一个 pi RPC 进程，问它要树/状态/可分支的消息。
 * 只在"用户主动看树 / 点分支"时调用，不进每轮对话链路。
 */

/** 取该会话正在用的 pi Agent（只有 runtime=cli 且命令是 pi RPC 才有会话树）。 */
function piAgentOf(topicId: string) {
  const db = getDb();
  const topic = db.select().from(topics).where(eq(topics.id, topicId)).get();
  if (!topic?.agentId) return null;
  const agent = db.select().from(agents).where(eq(agents.id, topic.agentId)).get() ?? null;
  if (!agent || agent.runtime !== 'cli') return null;
  if (!isPiCommand(agent.cliCommand) || !isPiRpcCommand(agent.cliCommand)) return null;
  return agent;
}

/** GET —— 会话树快照：状态 + 树 + 可分支的 user 消息。 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = piAgentOf(id);
  if (!agent?.cliCommand) {
    return Response.json({ error: '这个会话不是 pi（RPC）会话，没有会话树。' }, { status: 404 });
  }

  try {
    const snapshot = await readPiSession({
      command: agent.cliCommand,
      systemPrompt: agent.systemPrompt,
      topicId: id,
    });
    return Response.json({ ...snapshot, runtime: 'pi' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `读取 pi 会话失败：${message}` }, { status: 502 });
  }
}

/**
 * POST —— 会话内操作。
 * 目前支持 `{ action: 'navigate', entryId }`：从某条 user message 处开**兄弟分支**
 * （pi 的 `/tree` 语义；不生成摘要，但落盘以便跨进程续上）。
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; entryId?: unknown };
  const agent = piAgentOf(id);
  if (!agent?.cliCommand) {
    return Response.json({ error: '这个会话不是 pi（RPC）会话，没有会话树。' }, { status: 404 });
  }

  if (body.action !== 'navigate') {
    return Response.json({ error: `不支持的操作：${String(body.action)}` }, { status: 400 });
  }
  const entryId = String(body.entryId ?? '').trim();
  if (!entryId) return Response.json({ error: '缺少 entryId' }, { status: 400 });

  try {
    const response = await navigatePiSession({
      command: agent.cliCommand,
      entryId,
      systemPrompt: agent.systemPrompt,
      topicId: id,
    });
    if (!response.success) {
      return Response.json({ error: response.error ?? '导航失败' }, { status: 502 });
    }
    // 导航后再读一次快照，把新的 leaf 返回给前端
    const snapshot = await readPiSession({
      command: agent.cliCommand,
      systemPrompt: agent.systemPrompt,
      topicId: id,
    });
    return Response.json({ ...snapshot, ok: true, runtime: 'pi' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `分支失败：${message}` }, { status: 502 });
  }
}
