/**
 * 附件相关的**纯常量**（客户端/服务端都能 import）。
 *
 * 为什么要单独一个文件：`lib/files/uploads.ts` 要读写磁盘、算哈希，带 `node:*` 导入，
 * 被客户端组件 import 会直接打挂 bundle（webpack: Reading from "node:fs" is not handled）。
 * 凡是输入框、预览组件用得到的东西都放这里。
 */

/** 允许的图片类型（A 期只做图片；B/C 期再加文本/Office/PDF） */
export const IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/** 单个文件体积上限 5MB */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 一条消息最多几个附件 */
export const MAX_FILES_PER_MESSAGE = 6;

/** public 下的存放目录（也是 URL 前缀） */
export const UPLOAD_DIR = 'uploads';

/** 浏览器 <input accept>：图片 mime + 常见扩展名（部分浏览器只认扩展名） */
export const IMAGE_ACCEPT = [...IMAGE_MEDIA_TYPES, '.png', '.jpg', '.jpeg', '.webp', '.gif'].join(
  ',',
);
