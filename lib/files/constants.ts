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

/**
 * 文本类附件的体积上限 1MB。比"能塞进 prompt 的字数"宽松得多——因为真正进模型的只有
 * 前 50k 字（超了给预览，见 FILE_INLINE_MAX_CHARS）。上传限制卡太死会让用户频繁失败。
 */
export const MAX_TEXT_FILE_BYTES = 1024 * 1024;

/**
 * 读文本附件时的字符上限（≈文件体积上限 1MB，够读全量）。
 * 注意这不是"进 prompt 的字数"——那个由 FILE_INLINE_MAX_CHARS / FILE_PREVIEW_CHARS 决定。
 * 读全量是为了让"完整内容约 N 字"这句话**说的是真实字数**，模型据此知道自己漏了什么。
 */
export const MAX_TEXT_CHARS_PER_FILE = 1_000_000;

/**
 * 超过这个字符数就只给"预览"（学 LobeChat 的 `FILE_INLINE_MAX_CHARS`）：
 * 一次坏附件能永久污染整个会话（每轮都重发时更甚），所以宁可少给也要说清"这是预览"。
 */
export const FILE_INLINE_MAX_CHARS = 50_000;

/** 预览模式给模型看多少字（学 LobeChat 的 `FILE_PREVIEW_CHARS`） */
export const FILE_PREVIEW_CHARS = 4_000;

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

/**
 * mime → 落盘扩展名。**服务端与客户端共用这一份**：
 * 客户端要按同样的规则算出 `/uploads/<hash>.<ext>` 才能"先探一次再决定要不要上传"。
 */
export const EXT_BY_MEDIA_TYPE: Record<string, string> = {
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

/** 按 mime 猜落盘扩展名（猜不出就用原文件名里的，再不行 bin） */
export function storageExtensionFor(mediaType: string, filename?: string): string {
  const byMime = EXT_BY_MEDIA_TYPE[mediaType];
  if (byMime) return byMime;
  const ext = extOf(filename ?? '');
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'bin';
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
