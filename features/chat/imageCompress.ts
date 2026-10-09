'use client';

/**
 * 上传前图片压缩（抄 LobeChat 的 `packages/utils/src/compressImage.ts` 思路）：
 * 手机随手拍的 6MB JPEG 直接被 5MB 上限拒掉，用户只会觉得"传不上去"；
 * 先缩到最长边 1920 再压到 ~3MB，体验就从"失败"变成"能传"，还省 token 和带宽。
 *
 * 为什么自己写而不是装 sharp：sharp 是原生模块、要编译，浏览器端 canvas 就够了
 * （家用配方不为了压一张图引入构建负担）。
 */

/** 最长边超过这个尺寸就缩放 */
export const MAX_IMAGE_DIMENSION = 1920;

/** 压缩目标体积（base64 之前的二进制大小） */
export const COMPRESS_TARGET_BYTES = 3 * 1024 * 1024;

const JPEG_QUALITY = 0.85;

export interface PreparedImage {
  /** base64（不带 data: 前缀） */
  dataBase64: string;
  mediaType: string;
  /** 压缩后的字节数 */
  size: number;
  /** 到底压了没有（没压说明本来就够小） */
  compressed: boolean;
  filename: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

/** data URL → base64 + 字节数 */
function splitDataUrl(dataUrl: string): { base64: string; size: number } {
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  // base64 每 4 字符 = 3 字节
  return { base64, size: Math.floor((base64.length * 3) / 4) };
}

async function decode(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  return null;
}

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsDataURL(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * 给一张图片做"要不要压、怎么压"的决策，返回可直接上传的 base64。
 * 任何一步失败都**原样返回**（宁可大一点也不要把用户的图弄丢）。
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const original = await readAsDataUrl(file);
  const originalParts = splitDataUrl(original);
  const keep = (): PreparedImage => ({
    compressed: false,
    dataBase64: originalParts.base64,
    filename: file.name,
    mediaType: file.type || 'image/jpeg',
    size: originalParts.size,
  });

  const bitmap = await decode(file);
  if (!bitmap) return keep();

  const longest = Math.max(bitmap.width, bitmap.height);
  const needsResize = longest > MAX_IMAGE_DIMENSION;
  const needsShrink = originalParts.size > COMPRESS_TARGET_BYTES;
  if (!needsResize && !needsShrink) {
    bitmap.close();
    return keep();
  }

  const scale = needsResize ? MAX_IMAGE_DIMENSION / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return keep();
    context.drawImage(bitmap, 0, 0, width, height);

    // PNG 走 webp（截图文字更清晰、体积更小）；其余走 jpeg
    const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    let dataUrl = await canvasToDataUrl(canvas, type, JPEG_QUALITY);
    let mediaType = type;
    // webp 不支持时退回 jpeg
    if (!dataUrl && type === 'image/webp') {
      dataUrl = await canvasToDataUrl(canvas, 'image/jpeg', JPEG_QUALITY);
      mediaType = 'image/jpeg';
    }
    if (!dataUrl) return keep();

    const parts = splitDataUrl(dataUrl);
    // 压完反而更大（小图转 webp/jpeg 可能不划算）就用原图
    if (parts.size >= originalParts.size) return keep();

    return {
      compressed: true,
      dataBase64: parts.base64,
      filename: replaceExtension(file.name, mediaType),
      mediaType,
      size: parts.size,
    };
  } catch {
    return keep();
  } finally {
    bitmap.close();
  }
}

const EXT_BY_MEDIA_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function replaceExtension(filename: string, mediaType: string): string {
  const ext = EXT_BY_MEDIA_TYPE[mediaType];
  if (!ext) return filename;
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${ext}`;
}
