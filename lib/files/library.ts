import { desc, like } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

import { getDb } from '@/lib/db';
import { parseStoredParts } from '@/lib/db/messageParts';
import { messages as messagesTable } from '@/lib/db/schema';
import { UPLOAD_DIR } from '@/lib/files/constants';

/**
 * 「用过的附件」清单——`@文件` 提及的候选来源。
 *
 * 为什么不建 attachments 表：附件的**事实来源**本来就是 `messages.parts` 里的 file 片段
 * （上传后只存 URL，二进制在 `public/uploads`）。再存一张表就要处理"传到一半没发出去"
 * 的孤儿行、以及旧数据的回填，多一处能跟事实对不上的地方；直接从这里汇总，
 * 刷新/迁移/历史数据都自动一致。
 *
 * 代价是要扫 `messages.parts`：先用 `LIKE '%"file"%'` 把没有附件的行挡在 SQL 层，
 * 只解析可能带附件的那些行（个人库，够用）。
 */

export interface LibraryFile {
  /** 原始文件名（落盘名是 sha1，展示与回传都用这个） */
  filename: string;
  mediaType: string;
  /** 磁盘上的字节数（取不到就不给，如文件已被清理） */
  size?: number;
  url: string;
}

/** 最多往回翻多少条消息找附件（防着库里历史太大） */
const SCAN_MESSAGES = 300;

function sizeOf(url: string): number | undefined {
  // url 形如 /uploads/<hash>.<ext>；只认这个前缀，避免路径穿越
  const prefix = `/${UPLOAD_DIR}/`;
  if (!url.startsWith(prefix)) return undefined;
  const name = url.slice(prefix.length);
  if (!name || name.includes('/') || name.includes('\\')) return undefined;
  try {
    return fs.statSync(path.join(process.cwd(), 'public', UPLOAD_DIR, name)).size;
  } catch {
    return undefined;
  }
}

/** 汇总用过的附件：同 url 去重（保留最近一次的名字），最近用过的排前面。 */
export function listKnownFiles(limit = 50): LibraryFile[] {
  const rows = getDb()
    .select({ createdAt: messagesTable.createdAt, parts: messagesTable.parts })
    .from(messagesTable)
    .where(like(messagesTable.parts, '%"file"%'))
    .orderBy(desc(messagesTable.createdAt))
    .limit(SCAN_MESSAGES)
    .all();

  const seen = new Set<string>();
  const files: LibraryFile[] = [];
  for (const row of rows) {
    for (const part of parseStoredParts(row.parts) ?? []) {
      if (part.type !== 'file' || !part.url || seen.has(part.url)) continue;
      seen.add(part.url);
      files.push({
        filename: part.filename ?? part.url.split('/').pop() ?? '附件',
        mediaType: part.mediaType,
        size: sizeOf(part.url),
        url: part.url,
      });
      if (files.length >= limit) return files;
    }
  }
  return files;
}
