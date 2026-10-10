import { createMcpServer, listMcpServers } from '@/lib/db/mcpServers';
import { clearMcpCache } from '@/lib/mcp/client';

/** 把用户填的 headers（JSON 字符串或对象）归一成 JSON 字符串；非法返回 undefined。 */
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

/** GET /api/mcp/servers —— MCP server 列表。 */
export function GET() {
  return Response.json({ servers: listMcpServers() });
}

/** POST /api/mcp/servers —— 新增一个（Streamable HTTP）。 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    headers?: unknown;
    name?: unknown;
    url?: unknown;
  };

  const name = String(body.name ?? '').trim();
  const url = String(body.url ?? '').trim();
  if (!name) return Response.json({ error: '名字不能为空' }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ error: 'URL 必须是 http(s) 开头' }, { status: 400 });
  }

  const headers = normalizeHeaders(body.headers);
  if (!headers.ok) return Response.json({ error: 'headers 要是 JSON 对象' }, { status: 400 });

  const server = createMcpServer({ headers: headers.value, name, url });
  clearMcpCache();
  return Response.json({ server });
}
