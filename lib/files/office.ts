import { unzipSync } from 'fflate';
import path from 'node:path';

/**
 * Office / PDF 抽文本（**仅服务端**）。思路照 LobeChat 的 file-loaders，但砍到"够用"：
 *
 * - `.docx/.xlsx/.pptx` 本质是 zip + XML → `fflate` 解包后自己抽文本（不引 mammoth/exceljs）。
 * - `.pdf` 用 `pdfjs-dist` 的 legacy build 抽文字层（扫描件没有文字层 → 抽出来是空，已知限制）。
 * - **旧版 `.doc/.xls/.ppt`（OLE 二进制）不做**：纯 JS 抽不出，本机也没有 LibreOffice/antiword。
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** 去标签（保留我们手动插进去的换行/制表符） */
function stripTags(xml: string): string {
  return decodeXmlEntities(xml.replace(/<[^>]*>/g, ''));
}

function zipEntries(buffer: Buffer): Record<string, Uint8Array> {
  try {
    return unzipSync(new Uint8Array(buffer));
  } catch {
    return {};
  }
}

function textOfEntry(entries: Record<string, Uint8Array>, name: string): string {
  const entry = entries[name];
  return entry ? new TextDecoder('utf-8').decode(entry) : '';
}

/** `<a:t>…</a:t>` 里的文本 */
function textRuns(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1] ?? ''));
}

/** `ppt/slides/slide12.xml` → 12 */
function slideIndex(name: string): number {
  return Number(name.match(/slide(\d+)/)?.[1] ?? 0);
}

/** .docx → 段落文本（`</w:p>` 转成换行，`<w:tab/>` 转制表符） */
export function extractDocxText(buffer: Buffer): string {
  const xml = textOfEntry(zipEntries(buffer), 'word/document.xml');
  if (!xml) return '';
  return stripTags(xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n'));
}

/** .pptx → 每页一段（幻灯片按页码排序） */
export function extractPptxText(buffer: Buffer): string {
  const entries = zipEntries(buffer);
  const slides = Object.keys(entries)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideIndex(a) - slideIndex(b));
  if (slides.length === 0) return '';

  return slides
    .map((name, index) => {
      const xml = textOfEntry(entries, name);
      return `【第 ${index + 1} 页】\n${textRuns(xml).join(' ')}`;
    })
    .join('\n\n');
}

/**
 * .xlsx → 每个 sheet 的行（制表符分隔）。
 * 够用优先：共享字符串表 + 单元格引用定位列；不做公式/日期格式化。
 */
export function extractXlsxText(buffer: Buffer): string {
  const entries = zipEntries(buffer);
  if (Object.keys(entries).length === 0) return '';

  // 共享字符串：<si> 里所有 <t> 拼起来
  const sharedXml = textOfEntry(entries, 'xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedXml) {
    for (const si of sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(stripTags(si));
    }
  }

  const sheets = Object.keys(entries)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort();

  return sheets
    .map((name) => {
      const xml = textOfEntry(entries, name);
      const rows: string[] = [];
      for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
        const cells: Array<{ col: number; text: string }> = [];
        for (const cell of rowXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
          const ref = /\br="([A-Z]+)\d+"/.exec(cell)?.[1] ?? '';
          const col = [...ref].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
          const type = /\bt="([^"]+)"/.exec(cell)?.[1];
          let text = '';
          if (type === 's') {
            const index = Number(stripTags(/<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '-1'));
            text = shared[index] ?? '';
          } else if (type === 'inlineStr') {
            text = stripTags(/<is>[\s\S]*?<\/is>/.exec(cell)?.[0] ?? '');
          } else {
            text = stripTags(/<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? '');
          }
          if (text) cells.push({ col: Math.max(0, col), text });
        }
        cells.sort((a, b) => a.col - b.col);
        rows.push(cells.map((cell) => cell.text).join('\t'));
      }
      const title = name.replace(/^xl\/worksheets\//, '').replace(/\.xml$/, '');
      return `【${title}】\n${rows.join('\n')}`;
    })
    .join('\n\n');
}

/** .pdf → 文字层（扫描件没有文字层，会抽到空字符串） */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // 不给 standardFontDataUrl 会警告；它按"URL 工厂"用，必须是**正斜杠 + 结尾斜杠**
  // （path.join 会吃掉结尾斜杠，直接报 "Invalid factory url"）
  const fontsDir = path
    .join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts')
    .replaceAll('\\', '/');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: `${fontsDir}/`,
    useSystemFonts: false,
  }).promise;

  const pages: string[] = [];
  try {
    for (let page = 1; page <= doc.numPages; page += 1) {
      const p = await doc.getPage(page);
      const content = await p.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
  } finally {
    await doc.cleanup();
  }
  return pages.join('\n\n');
}

/**
 * 按扩展名分发。返回 null = 不支持/抽不出（调用方给一句人话提示）。
 * `ext` 用小写、不含点。
 */
export async function extractDocumentText(
  buffer: Buffer,
  ext: string,
): Promise<string | null> {
  try {
    switch (ext) {
      case 'docx':
        return extractDocxText(buffer) || null;
      case 'pptx':
        return extractPptxText(buffer) || null;
      case 'xlsx':
        return extractXlsxText(buffer) || null;
      case 'pdf':
        return (await extractPdfText(buffer)) || null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
