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

/**
 * 纯文本类附件（B 期）。代码文件也在这类里——对编码 Agent 很实用。
 * 用 `text/*` 之外的精确类型，因为浏览器给 .ts/.tsx 的 mime 不可靠（有的给 video/mp2t）。
 */
export const TEXT_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/x-sh',
] as const;

/** 文本类扩展名（上传时按扩展名兜底判定 mime：浏览器对代码文件的 type 不可靠） */
export const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'json', 'jsonc', 'csv', 'tsv', 'log', 'yml', 'yaml', 'toml', 'ini',
  'env', 'html', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs',
  'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'ps1', 'bat',
  'sql', 'xml', 'svg', 'vue', 'svelte', 'conf', 'ini', 'gitignore', 'dockerfile', 'makefile',
  'gradle', 'properties', 'tex', 'r',
];

/** Office / PDF（C 期）：走 zip+xml 与 pdfjs 抽文本 */
export const OFFICE_PDF_MEDIA_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const OFFICE_PDF_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx'];

/** 旧版 OLE 二进制格式：纯 JS 抽不出文本（本机也没有 LibreOffice/antiword）→ 明确提示不支持 */
export const LEGACY_OFFICE_EXTENSIONS = ['doc', 'xls', 'ppt'];

/** Office/PDF 的体积上限（比图片/文本宽松，但别把内存吃满） */
export const MAX_OFFICE_FILE_BYTES = 10 * 1024 * 1024;

/** 单个文件体积上限 5MB */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 文本文件更小的上限（要读进 prompt，别把上下文撑爆） */
export const MAX_TEXT_FILE_BYTES = 256 * 1024;

/** 单个文本文件塞进 prompt 的字符上限（超出截断并标注） */
export const MAX_TEXT_CHARS_PER_FILE = 20_000;

/** 一条消息最多几个附件 */
export const MAX_FILES_PER_MESSAGE = 6;

/** public 下的存放目录（也是 URL 前缀） */
export const UPLOAD_DIR = 'uploads';

const IMAGE_ACCEPT_LIST = [
  ...IMAGE_MEDIA_TYPES,
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
];

/** 浏览器 <input accept>：图片 + 文本 + Office/PDF（只列我们真能抽文本的：docx/xlsx/pptx/pdf） */
export const FILE_ACCEPT = [
  ...IMAGE_ACCEPT_LIST,
  ...TEXT_EXTENSIONS.map((ext) => `.${ext}`),
  ...OFFICE_PDF_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

/** 兼容旧名：只选图片时用 */
export const IMAGE_ACCEPT = IMAGE_ACCEPT_LIST.join(',');

/** 取文件名的扩展名（小写，不含点） */
export function extOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index < 0 ? '' : filename.slice(index + 1).toLowerCase();
}

/** 这个文件是不是"当纯文本读"的类型（mime 或扩展名任一命中即可） */
export function isTextFile(input: { filename?: string; mediaType: string }): boolean {
  if ((TEXT_MEDIA_TYPES as readonly string[]).includes(input.mediaType)) return true;
  const ext = extOf(input.filename ?? '');
  return ext !== '' && TEXT_EXTENSIONS.includes(ext);
}

/** Office/PDF（docx/xlsx/pptx/pdf）——我们能抽文本的那几种 */
export function isOfficeOrPdf(input: { filename?: string; mediaType: string }): boolean {
  if ((OFFICE_PDF_MEDIA_TYPES as readonly string[]).includes(input.mediaType)) {
    // 旧版 OLE（doc/xls/ppt）虽然 mime 在白名单里，但抽不出文本 → 不算支持
    return !LEGACY_OFFICE_EXTENSIONS.includes(extOf(input.filename ?? ''));
  }
  return OFFICE_PDF_EXTENSIONS.includes(extOf(input.filename ?? ''));
}

/** 旧版 Office 二进制格式（提示"请另存为 docx/pdf"用） */
export function isLegacyOffice(input: { filename?: string; mediaType: string }): boolean {
  const ext = extOf(input.filename ?? '');
  return LEGACY_OFFICE_EXTENSIONS.includes(ext);
}
