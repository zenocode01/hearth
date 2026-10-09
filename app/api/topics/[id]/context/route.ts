import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { agents, topics } from '@/lib/db/schema';
import { deleteLatestSummary } from '@/lib/db/topicSummaries';
import { createChatModel, MissingLlmConfigError } from '@/lib/llm';
import { loadTopicMessages, prepareContext, topicContextStats } from '@/lib/llm/compaction';

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

/**
 * GET —— 上下文占用读数（工具栏 chip 用）。
 *
 * 数字与聊天路由的判定**同源**（同一套估算 + 同一套阈值），否则 UI 显示 8k、
 * 实际却触发了压缩，用户只会觉得这东西不准。
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = agentOf(id);
  if (!agent) {
    // agentOf 返回 null 也可能是"会话没有 Agent"（走内置默认模型），要区分
    const exists = getDb().select({ id: topics.id }).from(topics).where(eq(topics.id, id)).get();
    if (!exists) return Response.json({ error: '会话不存在' }, { status: 404 });
  }

  return Response.json({
    ...topicContextStats(id),
    // 外部 CLI（pi 等）用它自己的 compaction，这条链路不做压缩 → UI 不显示这个 chip
    runtime: agent?.runtime ?? 'api',
  });
}

/**
 * POST —— 手动压缩一次（对应 chip 里的「立即压缩」）。
 *
 * 走的是与自动压缩完全相同的代码（prepareContext + force），只是跳过阈值判定。
 * 内置模型与外部 CLI（pi 等）都适用——CLI 会话也用我们自己的压缩（事实来源是 DB）。
 * 失败必须可读：这是用户主动点的按钮，静默失败最招烦。
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = agentOf(id);

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
  const result = await prepareContext({ force: true, messages: history, model, topicId: id });

  if (result.error) {
    return Response.json({ error: `压缩失败：${result.error}` }, { status: 502 });
  }
  if (!result.compacted) {
    return Response.json({
      ...topicContextStats(id),
      compacted: false,
      reason: '历史还太短（最近几轮之外的内容不够压）',
      runtime: agent?.runtime ?? 'api',
    });
  }

  return Response.json({
    ...topicContextStats(id),
    compacted: true,
    compressedCount: result.compressedCount,
    runtime: agent?.runtime ?? 'api',
  });
}

/**
 * DELETE —— 撤销最近一次压缩（删掉最新那条摘要）。
 *
 * 只删摘要、不动消息：水位线回退到上一条摘要（或没有），下次请求会把这段历史重新发给模型。
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const agent = agentOf(id);

  const removed = deleteLatestSummary(id);
  return Response.json({
    ...topicContextStats(id),
    removed,
    runtime: agent?.runtime ?? 'api',
  });
}
