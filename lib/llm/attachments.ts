import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai';

import { readUploadAsDataUrl, readUploadBytes } from '@/lib/files/uploads';

/**
 * UI 消息 → 模型消息（带图片附件）。
 *
 * 两个绕不开的坑，决定了这里为什么要自己写而不用裸 `convertToModelMessages`：
 *
 * 1. **相对 URL 会抛**：SDK 的 `convertToModelMessages` 对 file part 走 `new URL(part.url)`，
 *    我们的附件 URL 是 `/uploads/<hash>.png`，`new URL` 直接抛。所以先把 file part 摘掉，
 *    图片自己转成 data URL（`image` part）再拼回去。
 * 2. **历史里的图片不再重发**：只有**当前轮**（最后一条 user 消息）的图片进模型，
 *    更早的附件只保留文字描述。理由：每次重发都要把文件读成 base64，
 *    而且图片 token 会让本地模型的上下文迅速膨胀；"看之前那张图"需要用户重发。
 *    （LobeHub 是整段历史都带图的。）
 *
 * 非图片附件（文本/Office/PDF）这里**不处理**——它们由调用方抽成文本再拼进 prompt。
 */

/** 取出一条消息里的图片附件（mediaType 以 image/ 开头）。 */
function imagePartsOf(message: UIMessage) {
  return message.parts.filter(
    (part): part is Extract<UIMessage['parts'][number], { type: 'file' }> =>
      part.type === 'file' && part.mediaType.startsWith('image/'),
  );
}

/**
 * UI file 片段 → 模型 file part。
 *
 * `data` 必须是 `type:'data'`（传字节）：`type:'url'` 会让 SDK 去**下载**那个 URL，
 * data URL 直接失败（AI_DownloadError）。读不到字节（外链/文件已删）才退回 url 分支。
 */
async function toModelFilePart(part: { filename?: string; mediaType: string; url: string }) {
  const bytes = part.url.startsWith('/uploads/') ? await readUploadBytes(part.url) : null;
  return {
    data: bytes
      ? ({ data: bytes, type: 'data' as const } as const)
      : ({ type: 'url' as const, url: part.url } as const),
    filename: part.filename,
    mediaType: part.mediaType,
    // 用 file part（image part 在 AI SDK v7 已废弃，会打 deprecation 警告）；
    // provider 层按 mediaType 分流成 image_url
    type: 'file' as const,
  };
}

/**
 * 转成 streamText 用的 messages。
 * @param messages UI 消息（含 file 附件片段）
 * @param withImages 是否把最后一条 user 消息的图片转成 image part（CLI 分支自己拼 prompt，用 false）
 */
export async function toModelMessagesWithImages(
  messages: UIMessage[],
  options: { withImages?: boolean } = {},
): Promise<ModelMessage[]> {
  const withImages = options.withImages ?? true;
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');
  const out: ModelMessage[] = [];

  for (const [index, message] of messages.entries()) {
    const files = imagePartsOf(message);
    const isLastUser = withImages && index === lastUserIndex;
    // **一律**先把 file 片段摘掉再交给 SDK：convertToModelMessages 会对 file part 做
    // `new URL(part.url)`，我们的 `/uploads/…` 是相对路径 → Invalid URL（必须摘，不能留）
    const parts = message.parts.filter((part) => part.type !== 'file');
    const [converted] = await convertToModelMessages([{ ...message, parts } as UIMessage]);

    if (!converted) continue;
    if (!isLastUser || files.length === 0) {
      out.push(converted);
      continue;
    }

    const images = await Promise.all(files.map((file) => toModelFilePart(file)));
    const base = converted.content;
    const content = [
      ...(typeof base === 'string'
        ? base.trim()
          ? [{ text: base, type: 'text' as const }]
          : []
        : (base ?? [])),
      ...images,
    ];
    out.push({ ...converted, content } as ModelMessage);
  }

  return out;
}

/**
 * 当前轮的图片附件（CLI/pi 分支用）：返回 base64 + mimeType，
 * pi 的 RPC prompt 命令要 `{ type:'image', mimeType, data:<base64> }`。
 */
export async function currentTurnImages(
  messages: UIMessage[],
): Promise<Array<{ data: string; mediaType: string }>> {
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');
  if (lastUserIndex < 0) return [];
  const files = imagePartsOf(messages[lastUserIndex]);

  const out: Array<{ data: string; mediaType: string }> = [];
  for (const file of files) {
    const dataUrl = file.url.startsWith('/uploads/') ? await readUploadAsDataUrl(file.url) : file.url;
    if (!dataUrl?.startsWith('data:')) continue; // 外链图片 pi 侧收不了（要 base64）
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64) out.push({ data: base64, mediaType: file.mediaType });
  }
  return out;
}
