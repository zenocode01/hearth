import type { ChatMessage, Topic } from '@/lib/db/schema';

/** 导出格式：md = 阅读/分享，json = 完整备份（含推理、工具片段）。 */
export type ExportFormat = 'md' | 'json';

/** 导出文件格式标记（json 里用于识别文件来源与版本）。 */
const EXPORT_APP = 'hearth';
const EXPORT_VERSION = 1;

const ROLE_LABEL: Record<ChatMessage['role'], string> = {
  user: '我',
  assistant: 'AI',
};

/** `YYYY-MM-DD HH:mm`（本地时间）。 */
function formatDateTime(value: Date | string | number): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 文件名安全的日期：`YYYYMMDD`。 */
function dateStamp(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * 导出文件名：`<会话标题>-<日期>.<ext>`。
 * 标题里的 Windows/Unix 非法字符换成 `-`，限长防超长路径。
 */
export function exportFilename(title: string, format: ExportFormat): string {
  const base =
    title
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '对话';
  return `${base}-${dateStamp()}.${format}`;
}

/**
 * 会话 → Markdown（给人读的）。
 * 结构：标题 + 元信息 + 每条消息（角色 · 时间 + 正文）；推理过程包在 `<details>` 里。
 */
export function renderMarkdown(topic: Topic, msgs: ChatMessage[]): string {
  const lines: string[] = [
    `# ${topic.title}`,
    '',
    `> 导出自 Hearth · ${formatDateTime(new Date())} · ${msgs.length} 条消息`,
    '',
  ];

  for (const msg of msgs) {
    lines.push(`## ${ROLE_LABEL[msg.role] ?? msg.role} · ${formatDateTime(msg.createdAt)}`, '');

    if (msg.reasoning) {
      lines.push('<details>', '<summary>思考过程</summary>', '', msg.reasoning, '', '</details>', '');
    }

    if (msg.content) lines.push(msg.content, '');
  }

  // 收尾多一个空行没关系，但避免文件末尾堆一堆空行
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/**
 * 会话 → JSON（无损备份）：完整 topic 行 + 全部消息行（含 reasoning / parts）。
 */
export function buildJsonPayload(topic: Topic, msgs: ChatMessage[]): string {
  return JSON.stringify(
    {
      app: EXPORT_APP,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      topic,
      messages: msgs,
    },
    null,
    2,
  );
}
