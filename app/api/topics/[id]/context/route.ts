import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { agents, topics, type Agent } from '@/lib/db/schema';
import { deleteLatestSummary } from '@/lib/db/topicSummaries';
import { createChatModel, MissingLlmConfigError } from '@/lib/llm';
import { loadTopicMessages, prepareContext, topicContextStats } from '@/lib/llm/compaction';
import { getContextWindow } from '@/lib/llm/modelContext';
import { isPiCommand, isPiRpcCommand } from '@/lib/llm/piCommand';
import { runPiSessionCommands } from '@/lib/llm/piSession';

type Params = { params: Promise<{ id: string }> };

/** 会话用的 Agent（决定摘要用哪个模型、以及这条链路压不压缩）。 */
function agentOf(topicId: string) {
  const db = getDb();
  const topic = db.select().from(topics).where(eq(topics.id, topicId)).get();
  if (!topic) return null;
  return topic.agentId
    ? (db.select().from(agents).where(eq(agents.id, topic.agentId)).get() ?? null)
    : null;
}

/** pi 主题：命令是不是 pi 的 RPC 模式（只有它有 get_session_stats）。 */
function isPi(agent: Agent | null): agent is Agent & { cliCommand: string } {
  return (
    agent?.runtime === 'cli' &&
    isPiCommand(agent.cliCommand) &&
    isPiRpcCommand(agent.cliCommand)
  );
}

interface PiStats {
  contextWindow: number | null;
  estimatedTokens: number;
  keepRecentTurns: number;
  limit: number;
  messageCount: number;
  percent: number | null;
  runtime: 'pi';
  summaryCount: number;
  summaries: never[];
  threshold: number;
}

/**
 * pi 主题的真实上下文占用：`get_session_stats.contextUsage`（pi 自己算的，
 * 用于它自己的自动压缩与 footer 显示）。拿不到就回退我们的 DB 估算。
 */
async function piStats(agent: Agent & { cliCommand: string }, topicId: string): Promise<PiStats> {
  const contextWindow = await getContextWindow({ runtime: 'cli' });
  try {
    const [response] = await runPiSessionCommands({
      command: agent.cliCommand,
      requests: [{ type: 'get_session_stats' }],
      systemPrompt: agent.systemPrompt,
      topicId,
    });
    const data = response?.data as
      | {
          contextUsage?: { contextWindow?: number; percent?: number | null; tokens?: number | null };
          totalMessages?: number;
        }
      | undefined;
    const usage = data?.contextUsage;
    const window = usage?.contextWindow ?? contextWindow;
    return {
      contextWindow: window,
      estimatedTokens: usage?.tokens ?? 0,
      keepRecentTurns: 0,
      limit: 0,
      messageCount: data?.totalMessages ?? 0,
      percent: usage?.percent ?? null,
      runtime: 'pi',
      summaryCount: 0,
      summaries: [],
      threshold: window ?? 0,
    };
  } catch {
    // pi 不在/超时：回退我们自己的估算，至少 chip 有数
    const fallback = topicContextStats(topicId, contextWindow);
    return {
      ...fallback,
      percent: null,
      runtime: 'pi',
      summaryCount: 0,
      summaries: [],
    };
  }
}

/**
 * GET —— 上下文占用读数（工具栏 chip 用）。
 *
 * pi 主题：数字来自 pi 的 `get_session_stats`（真实占用）；其余走我们自己的估算，
 * 与聊天路由的判定同源。
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = agentOf(id);
  if (!agent) {
    const exists = getDb().select({ id: topics.id }).from(topics).where(eq(topics.id, id)).get();
    if (!exists) return Response.json({ error: '会话不存在' }, { status: 404 });
  }

  if (isPi(agent)) return Response.json(await piStats(agent, id));

  const contextWindow = await getContextWindow({
    modelId: agent?.model,
    runtime: agent?.runtime === 'cli' ? 'cli' : 'api',
  });

  return Response.json({
    ...topicContextStats(id, contextWindow),
    runtime: agent?.runtime ?? 'api',
  });
}

/**
 * POST —— 手动压缩一次。
 * - pi 主题：调 pi 的 `compact`（它自己的压缩，会写 compaction entry）；
 * - 其余：走我们的 prepareContext + force。
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = agentOf(id);

  if (isPi(agent)) {
    try {
      const [response] = await runPiSessionCommands({
        command: agent.cliCommand,
        requests: [{ type: 'compact' }],
        systemPrompt: agent.systemPrompt,
        topicId: id,
      });
      if (!response?.success) {
        return Response.json({ error: response?.error ?? 'pi 压缩失败' }, { status: 502 });
      }
      const data = response.data as
        | { estimatedTokensAfter?: number; tokensBefore?: number }
        | undefined;
      return Response.json({
        ...(await piStats(agent, id)),
        compacted: true,
        estimatedTokensAfter: data?.estimatedTokensAfter,
        tokensBefore: data?.tokensBefore,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: `pi 压缩失败：${message}` }, { status: 502 });
    }
  }

  const contextWindow = await getContextWindow({
    modelId: agent?.model,
    runtime: agent?.runtime === 'cli' ? 'cli' : 'api',
  });

  let model;
  try {
    model = createChatModel(agent?.model);
  } catch (error) {
    if (error instanceof MissingLlmConfigError) {
      return Response.json(
        { error: `模型未配置：缺少 ${error.missing.join(' / ')}（见 .env.local）` },
        { status: 500 },
      );
    }
    throw error;
  }

  const history = loadTopicMessages(id);
  const result = await prepareContext({ contextWindow, force: true, messages: history, model, topicId: id });

  if (result.error) {
    return Response.json({ error: `压缩失败：${result.error}` }, { status: 502 });
  }
  if (!result.compacted) {
    return Response.json({
      ...topicContextStats(id, contextWindow),
      compacted: false,
      reason: '历史还太短（最近几轮之外的内容不够压）',
      runtime: agent?.runtime ?? 'api',
    });
  }

  return Response.json({
    ...topicContextStats(id, contextWindow),
    compacted: true,
    compressedCount: result.compressedCount,
    runtime: agent?.runtime ?? 'api',
  });
}

/**
 * DELETE —— 撤销最近一次压缩（删掉最新那条摘要）。
 * pi 主题的压缩由 pi 自己管理，暂不支持撤销（返回 ok + 说明）。
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = agentOf(id);

  if (isPi(agent)) {
    return Response.json({
      ...(await piStats(agent, id)),
      reason: 'pi 会话的压缩由 pi 自己管理，暂不支持撤销。',
      removed: false,
    });
  }

  const contextWindow = await getContextWindow({
    modelId: agent?.model,
    runtime: agent?.runtime === 'cli' ? 'cli' : 'api',
  });

  const removed = deleteLatestSummary(id);
  return Response.json({
    ...topicContextStats(id, contextWindow),
    removed,
    runtime: agent?.runtime ?? 'api',
  });
}
