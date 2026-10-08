import { asc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { messages, topics } from '@/lib/db/schema';
import { buildJsonPayload, exportFilename, renderMarkdown } from '@/lib/export/topicExport';

type Params = { params: Promise<{ id: string }> };

/**
 * GET —— 导出单个会话（`?format=md | json`，默认 md）。
 * 以附件形式返回（`Content-Disposition: attachment`），浏览器直接下载。
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') === 'json' ? 'json' : 'md';

  const db = getDb();
  const topic = db.select().from(topics).where(eq(topics.id, id)).get();
  if (!topic) return Response.json({ error: '会话不存在' }, { status: 404 });

  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.topicId, id))
    .orderBy(asc(messages.createdAt))
    .all();

  const filename = exportFilename(topic.title, format);
  // ASCII 兜底名（部分老客户端只认 filename），中文名走 filename*
  const asciiFilename = filename.replace(/[^\x20-\x7e]/g, '-');

  const body = format === 'json' ? buildJsonPayload(topic, rows) : renderMarkdown(topic, rows);

  return new Response(body, {
    headers: {
      'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Type':
        format === 'json'
          ? 'application/json; charset=utf-8'
          : 'text/markdown; charset=utf-8',
    },
  });
}
