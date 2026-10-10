import { testServer } from '@/lib/mcp/client';

/**
 * POST /api/mcp/test —— 测试连接并返回工具清单（配置页"测试"按钮用）。
 * body: { url, headers? }（headers 为 JSON 字符串或对象）
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { headers?: unknown; url?: unknown };
  const url = String(body.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ error: 'URL 必须是 http(s) 开头' }, { status: 400 });
  }

  let headers: Record<string, string> = {};
  if (body.headers) {
    try {
      const parsed = typeof body.headers === 'string' ? JSON.parse(body.headers) : body.headers;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        headers = parsed as Record<string, string>;
      }
    } catch {
      return Response.json({ error: 'headers 要是 JSON 对象' }, { status: 400 });
    }
  }

  try {
    const tools = await testServer({ headers, id: `test-${Date.now()}`, name: 'test', url });
    return Response.json({ count: tools.length, tools: tools.map((item) => item.name) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '连接失败' },
      { status: 502 },
    );
  }
}
