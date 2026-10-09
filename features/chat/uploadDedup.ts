'use client';

import { storageExtensionFor, UPLOAD_DIR } from '@/lib/files/constants';

/**
 * 上传前去重（对应 LobeChat 的 `checkFileHash` → 命中就跳过上传）。
 *
 * 但我们**不需要它的 global_files 表**：落盘文件名本来就是 `sha1(内容)` 的前 32 位
 * （`public/uploads/<hash>.<ext>`），所以客户端算出同样的哈希后，
 * 直接 `HEAD /uploads/<hash>.<ext>` 探一下文件在不在就行——
 * **零 schema 改动、零迁移**，还天然自愈（文件被删了就会重新上传）。
 */

/** 与服务端 uploads.ts 保持一致：sha1 前 32 位十六进制 */
const HASH_LENGTH = 32;

/** base64 → sha1 hex（截断到 32 位）。用 WebCrypto，浏览器原生。 */
export async function sha1HexFromBase64(dataBase64: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const binary = atob(dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return hex.slice(0, HASH_LENGTH);
  } catch {
    return null;
  }
}

/** 这个内容是不是已经在服务器上了？返回已存在的 URL（不在则 null）。 */
export async function probeExistingUpload(input: {
  dataBase64: string;
  filename: string;
  mediaType: string;
}): Promise<string | null> {
  const hash = await sha1HexFromBase64(input.dataBase64);
  if (!hash) return null;
  const ext = storageExtensionFor(input.mediaType, input.filename);
  const url = `/${UPLOAD_DIR}/${hash}.${ext}`;

  try {
    // HEAD：Next 对 public 静态文件支持 HEAD，命中 200 / 未命中 404
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}
