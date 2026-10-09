import { saveUpload, UploadError } from '@/lib/files/uploads';

/**
 * POST /api/files —— 上传附件（图片）。
 * body: { dataBase64: "data:image/png;base64,…" 或裸 base64, filename?, mediaType }
 * → { file: { url, filename, mediaType, size } }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    dataBase64?: string;
    filename?: string;
    mediaType?: string;
  } | null;

  if (!body?.dataBase64 || !body.mediaType) {
    return Response.json({ error: '缺少 dataBase64 或 mediaType' }, { status: 400 });
  }

  try {
    const file = await saveUpload({
      dataBase64: body.dataBase64,
      filename: body.filename,
      mediaType: body.mediaType,
    });
    return Response.json({ file });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
