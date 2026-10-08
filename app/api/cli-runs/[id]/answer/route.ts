import { resolveQuestion } from '@/lib/llm/cliRuns';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/cli-runs/[id]/answer —— 把用户对 pi（RPC 模式）提问的回答送回正在等待的进程。
 * body: { requestId, value? , cancelled? }
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { requestId, value, cancelled } = (await req.json().catch(() => ({}))) as {
    cancelled?: boolean;
    requestId?: string;
    value?: string;
  };

  if (!requestId) return Response.json({ error: '缺少 requestId' }, { status: 400 });

  const ok = resolveQuestion(id, requestId, cancelled ? { cancelled: true } : { value });
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
