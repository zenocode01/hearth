import type { UIMessage } from 'ai';

/**
 * 入库用的消息片段（存 `messages.parts` 一列的 JSON）。
 *
 * 刻意**不直接存 AI SDK 的 part 对象**：SDK 升级（part 结构会变）不该污染历史数据。
 * 这里只保留 UI 渲染需要的字段；工具片段回读时再还原成 `tool-<name>`。
 */
export type StoredPart =
  | { text: string; type: 'reasoning' }
  | { text: string; type: 'text' }
  | {
      errorText?: string;
      input?: unknown;
      output?: unknown;
      state: string;
      toolCallId: string;
      toolMetadata?: unknown;
      toolName: string;
      type: 'tool';
    };

/** UIMessage.parts → 入库片段（丢弃 step-start 等渲染无关的片段）。 */
export function serializeParts(parts: UIMessage['parts']): StoredPart[] {
  const stored: StoredPart[] = [];

  for (const part of parts) {
    if (part.type === 'text') {
      stored.push({ text: part.text, type: 'text' });
      continue;
    }
    if (part.type === 'reasoning') {
      stored.push({ text: part.text, type: 'reasoning' });
      continue;
    }

    const isDynamic = part.type === 'dynamic-tool';
    const isStatic = typeof part.type === 'string' && part.type.startsWith('tool-');
    if (!isDynamic && !isStatic) continue;

    const tool = part as {
      errorText?: string;
      input?: unknown;
      output?: unknown;
      state: string;
      toolCallId: string;
      toolMetadata?: unknown;
      toolName?: string;
    };
    stored.push({
      errorText: tool.errorText,
      input: tool.input,
      output: tool.output,
      state: tool.state,
      toolCallId: tool.toolCallId,
      toolMetadata: tool.toolMetadata,
      toolName: tool.toolName ?? String(part.type).slice('tool-'.length),
      type: 'tool',
    });
  }

  return stored;
}

/** 入库片段 → UIMessage.parts（历史消息渲染用）。 */
export function deserializeParts(stored: StoredPart[]): UIMessage['parts'] {
  const parts: unknown[] = stored.map((part) => {
    if (part.type === 'text') return { text: part.text, type: 'text' };
    if (part.type === 'reasoning') return { text: part.text, type: 'reasoning' };
    return {
      errorText: part.errorText,
      input: part.input,
      output: part.output,
      state: part.state,
      toolCallId: part.toolCallId,
      toolMetadata: part.toolMetadata,
      type: `tool-${part.toolName}`,
    };
  });

  return parts as UIMessage['parts'];
}

/** 宽松解析数据库里的 parts 字段：坏数据当没有处理（不让历史加载整体失败）。 */
export function parseStoredParts(raw: string | null | undefined): StoredPart[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as StoredPart[];
  } catch {
    return null;
  }
}
