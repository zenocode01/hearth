import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai';

import {
  extOf,
  isOfficeOrPdf,
  isTextFile,
  MAX_TEXT_CHARS_PER_FILE,
} from '@/lib/files/constants';
import { extractDocumentText } from '@/lib/files/office';
import { readUploadAsDataUrl, readUploadBytes, readUploadText } from '@/lib/files/uploads';

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

/** 取出一条消息里的"非图片"附件（文本类；C 期后还会有 Office/PDF）。 */
function otherPartsOf(message: UIMessage) {
  return message.parts.filter(
    (part): part is Extract<UIMessage['parts'][number], { type: 'file' }> =>
      part.type === 'file' && !part.mediaType.startsWith('image/'),
  );
}

/**
 * 当前轮的文本类附件 → `<file name="x.md">…</file>` 文本块。
 *
 * 为什么转成**文本段**而不是 file part：provider 对 `data.type === 'text'` 的 file part
 * 直接抛错（UnsupportedFunctionalityError）。这个 `<file name>` 包裹沿用 pi 的约定，
 * 模型对"这是附件内容"的辨识度更好。
 *
 * 三类来源：纯文本直接读；docx/xlsx/pptx/pdf 抽文本（C 期）；都不行就给一句人话提示。
 */
export async function currentTurnTextBlocks(messages: UIMessage[]): Promise<string> {
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');
  if (lastUserIndex < 0) return '';
  const files = otherPartsOf(messages[lastUserIndex]);

  const blocks: string[] = [];
  for (const file of files) {
    const name = file.filename ?? '附件';
    let text: string | null = null;

    if (isTextFile({ filename: file.filename, mediaType: file.mediaType })) {
      const read = await readUploadText(file.url, MAX_TEXT_CHARS_PER_FILE);
      if (read) {
        text = read.truncated ? `${read.text}\n…（内容过长，已截断）` : read.text;
      }
    } else if (isOfficeOrPdf({ filename: file.filename, mediaType: file.mediaType })) {
      const bytes = await readUploadBytes(file.url);
      if (bytes) text = await extractDocumentText(bytes, extOf(file.filename ?? ''));
    }

    if (text === null) {
      blocks.push(
        `<file name="${name}">（无法提取文本：可能是扫描版 PDF、旧版 Office（.doc/.xls/.ppt）或文件已清理）</file>`,
      );
      continue;
    }
    blocks.push(`<file name="${name}">\n${text}\n</file>`);
  }
  return blocks.join('\n\n');
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
    if (!isLastUser) {
      out.push(converted);
      continue;
    }

    // 文本类附件 → `<file name>` 文本块拼在最后一条 user 消息里（图片之前）
    const textBlocks = await currentTurnTextBlocks(messages);
    const base = converted.content;
    const text = [
      ...(typeof base === 'string'
        ? base.trim()
          ? [base]
          : []
        : (base ?? []).map((part) => ('text' in part ? part.text : '')).filter(Boolean)),
      textBlocks,
    ]
      .filter(Boolean)
      .join('\n\n');

    const images = await Promise.all(files.map((file) => toModelFilePart(file)));
    const content = [
      ...(text.trim() ? [{ text, type: 'text' as const }] : []),
      ...images,
    ];
    // 既没文本也没图片（理论上不会发生）就别造空消息
    if (content.length === 0) continue;
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
