import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  extOf,
  isTextFile,
  MAX_FILE_BYTES,
  MAX_TEXT_FILE_BYTES,
  UPLOAD_DIR,
} from './constants';

/**
 * 附件落盘（图片/文件上传）。**只在服务端 import**（带 node:* 依赖）。
 * 设计照 LobeChat 的思路但砍到"家用配方"：
 *
 * - **文件存 `public/uploads/<sha1>.<ext>`**，DB 只在消息片段里存 URL + 文件名
 *   （同 AGENTS 的 image-generation 约定：DB 不存二进制）。
 * - **按内容哈希命名** → 同一张图重复上传只占一份，天然去重。
 * - 文件名里的中文/空格不参与 URL（只存哈希），原名放消息片段里用于显示。
 *
 * A 期放行**图片**，B 期加**纯文本**（类型/体积常量在 `constants.ts`，客户端也要用）。
 * C 期再加 Office/PDF（要解析库，届时在这里做抽文本）。
 */
const UPLOAD_URL_PREFIX = `/${UPLOAD_DIR}/`;

const EXT_BY_MEDIA_TYPE: Record<string, string> = {
  'application/json': 'json',
  'text/css': 'css',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/javascript': 'js',
  'text/markdown': 'md',
  'text/plain': 'txt',
  'text/xml': 'xml',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface UploadedFile {
  filename: string;
  mediaType: string;
  size: number;
  /** 可直接存进消息片段的相对 URL（`/uploads/<hash>.<ext>`） */
  url: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

function uploadsRoot(): string {
  return path.join(process.cwd(), 'public', UPLOAD_DIR);
}

export function isSupportedMediaType(mediaType: string): boolean {
  return mediaType in EXT_BY_MEDIA_TYPE;
}

/** 浏览器 <input accept> 在 `constants.ts`（客户端要 import，不能引本文件） */

/** 落盘用的扩展名：优先按 mime 映射，其次用原文件名的扩展名（代码文件 mime 不可靠） */
function storageExtension(mediaType: string, filename?: string): string {
  const byMime = EXT_BY_MEDIA_TYPE[mediaType];
  if (byMime) return byMime;
  const ext = extOf(filename ?? '');
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
}

function decodeBase64(dataBase64: string): Buffer {
  // 兼容 data URL 前缀与 base64 里的空白/换行
  const raw = dataBase64.includes(',') ? dataBase64.slice(dataBase64.indexOf(',') + 1) : dataBase64;
  const buffer = Buffer.from(raw.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) throw new UploadError('文件内容为空', 400);
  return buffer;
}

/**
 * 保存一个上传文件 → 返回可存进消息片段的信息。
 * 同内容哈希 = 同文件名 = 覆盖写（同内容，无副作用）。
 */
export async function saveUpload(input: {
  dataBase64: string;
  filename?: string;
  mediaType: string;
}): Promise<UploadedFile> {
  const { dataBase64, filename, mediaType } = input;
  const asText = isTextFile({ filename, mediaType });

  if (!isSupportedMediaType(mediaType) && !asText) {
    throw new UploadError(`暂不支持的文件类型：${filename || mediaType || '未知'}`, 415);
  }

  const buffer = decodeBase64(dataBase64);
  // 文本文件要读进 prompt，单独用更小的上限
  const limit = asText ? MAX_TEXT_FILE_BYTES : MAX_FILE_BYTES;
  if (buffer.length > limit) {
    throw new UploadError(
      `${filename ?? '文件'} 太大（${(buffer.length / 1024).toFixed(0)}KB），上限 ${Math.round(limit / 1024)}KB`,
      413,
    );
  }

  const ext = storageExtension(mediaType, filename);
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 32);
  const name = `${hash}.${ext}`;

  await mkdir(uploadsRoot(), { recursive: true });
  await writeFile(path.join(uploadsRoot(), name), buffer);

  return {
    filename: filename?.slice(0, 120) || name,
    mediaType,
    size: buffer.length,
    url: `${UPLOAD_URL_PREFIX}${name}`,
  };
}

/**
 * 把已存的文件读回字节——发模型前用。
 * 只认 `/uploads/<纯文件名>`，挡掉路径穿越。
 */
export async function readUploadBytes(url: string): Promise<Buffer | null> {
  if (!url.startsWith(UPLOAD_URL_PREFIX)) return null;
  const name = url.slice(UPLOAD_URL_PREFIX.length);
  if (!/^[a-f0-9]{8,64}\.[a-z0-9]{1,12}$/i.test(name)) return null;

  try {
    return await readFile(path.join(uploadsRoot(), name));
  } catch {
    return null;
  }
}

/**
 * 读回文本内容（B 期：纯文本附件进 prompt 用）。
 * 超长按 maxChars 截断并标注，避免一个日志文件把上下文撑爆。
 */
export async function readUploadText(
  url: string,
  maxChars: number,
): Promise<{ text: string; truncated: boolean } | null> {
  const buffer = await readUploadBytes(url);
  if (!buffer) return null;
  const full = buffer.toString('utf8');
  if (full.length <= maxChars) return { text: full, truncated: false };
  return { text: full.slice(0, maxChars), truncated: true };
}

/**
 * 把已存的文件读回 data URL（部分场景要字符串时用；模型链路优先用
 * `readUploadBytes` + `file` part 的 `data.type='data'`，那条路不会触发下载）。
 */
export async function readUploadAsDataUrl(url: string): Promise<string | null> {
  const buffer = await readUploadBytes(url);
  if (!buffer) return null;
  const ext = path.extname(url).slice(1).toLowerCase();
  const mediaType =
    Object.entries(EXT_BY_MEDIA_TYPE).find(([, value]) => value === ext)?.[0] ??
    'application/octet-stream';
  return `data:${mediaType};base64,${buffer.toString('base64')}`;
}
