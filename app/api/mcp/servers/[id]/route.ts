import { deleteMcpServer, getMcpServer, updateMcpServer } from '@/lib/db/mcpServers';
import { clearMcpCache } from '@/lib/mcp/client';

type Params = { params: Promise<{ id: string }> };

function normalizeHeaders(input: unknown): { ok: boolean; value: string | null } {
  if (input === undefined || input === null || input === '') return { ok: true, value: null };
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, value: null };
    return { ok: true, value: JSON.stringify(parsed) };
  } catch {
    return { ok: false, value: null };
  }
}

/** PATCH /api/mcp/servers/[id] —— 改名字/URL/headers/启用状态。 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  if (!getMcpServer(id)) return Response.json({ error: '不存在' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: unknown;
    headers?: unknown;
    name?: unknown;
    url?: unknown;
  };

  const patch: { enabled?: boolean; headers?: string | null; name?: string; url?: string } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return Response.json({ error: '名字不能为空' }, { status: 400 });
    patch.name = name;
  }
  if (body.url !== undefined) {
    const url = String(body.url).trim();
    if (!/^https?:\/\//i.test(url)) return Response.json({ error: 'URL 必须是 http(s) 开头' }, { status: 400 });
    patch.url = url;
  }
  if (body.headers !== undefined) {
    const headers = normalizeHeaders(body.headers);
    if (!headers.ok) return Response.json({ error: 'headers 要是 JSON 对象' }, { status: 400 });
    patch.headers = headers.value;
  }
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);

  updateMcpServer(id, patch);
  clearMcpCache();
  return Response.json({ ok: true, server: getMcpServer(id) });
}

/** DELETE /api/mcp/servers/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  deleteMcpServer(id);
  clearMcpCache();
  return Response.json({ ok: true });
}
