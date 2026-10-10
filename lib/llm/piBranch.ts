import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, type Dirent } from 'node:fs';
import path from 'node:path';

import type { StoredPart } from '@/lib/db/messageParts';

import { PI_ISOLATED, PI_SESSION_DIR } from './piEnv';

/**
 * 读 pi 会话文件，还原**当前分支**（active leaf → root 的路径）上的消息。
 *
 * 为什么读文件而不是问 pi（RPC get_entries）：这是我们**每次打开会话**都要做的事，
 * 起一个 pi 进程要几秒；而会话文件就在本地，解析 JSONL 是毫秒级。
 *
 * 为什么可以直接把"最后一条 entry"当 leaf：pi 是 append-only 树，且我们每次会话内导航
 * 都会带 label（扩展 `hearth-tree` 里固定这么做）→ navigate 会 append 一个 label entry，
 * 于是"当前 leaf 永远是文件里最后一条带 id 的 entry"。正常发消息同理（append 后 leaf=新条目）。
 *
 * 只在隔离模式下可用（此时会话落在 `PI_SESSION_DIR`）；非隔离（用户全局 ~/.pi）读不到，
 * 返回 null 让调用方回退到 DB 里的线性镜像。
 */

export interface PiBranchMessage {
  /** entry 时间戳（ISO）；用来显示消息时间 */
  createdAt?: string | null;
  /** pi entry id（8 位 hex，稳定，可当 React key） */
  id: string;
  /** 与 DB 里 `messages.parts` 同构（复用 deserializeParts 渲染） */
  parts: StoredPart[];
  role: 'assistant' | 'user';
}

interface RawEntry {
  id?: string;
  message?: {
    content?: unknown;
    details?: unknown;
    errorMessage?: unknown;
    isError?: unknown;
    role?: unknown;
    toolCallId?: unknown;
  };
  parentId?: string | null;
  timestamp?: string;
  type?: string;
}

type ToolPart = Extract<StoredPart, { type: 'tool' }>;

/** 在会话目录里按 `<...>_<sessionId>.jsonl` 找会话文件（会话多时按目录分层，递归找）。 */
function findSessionFile(sessionId: string): string | null {
  const root = PI_SESSION_DIR;
  if (!existsSync(root)) return null;
  const suffix = `_${sessionId}.jsonl`;

  const walk = (dir: string, depth: number): string | null => {
    if (depth > 4) return null;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const hit = walk(full, depth + 1);
        if (hit) return hit;
      } else if (entry.name.endsWith(suffix)) {
        return full;
      }
    }
    return null;
  };

  return walk(root, 0);
}

/** 消息内容块：content 可能是字符串，也可能是 `[{type,...}]` 块数组。 */
function blocks(content: unknown): Array<Record<string, unknown>> {
  if (typeof content === 'string') return [{ text: content, type: 'text' }];
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
}

function textOfBlocks(content: unknown): string {
  return blocks(content)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('');
}

/** 读会话文件 → 当前分支的消息（读不到返回 null）。 */
export function readPiBranchMessages(topicId: string): PiBranchMessage[] | null {
  if (!PI_ISOLATED) return null;

  const file = findSessionFile(topicId);
  if (!file) return null;
  let raw: string;
  try {
    if (statSync(file).size > 200 * 1024 * 1024) return null; // 超大文件不读，避免卡死
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  const byId = new Map<string, RawEntry>();
  let leafId: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry: RawEntry;
    try {
      entry = JSON.parse(line) as RawEntry;
    } catch {
      continue; // 正在写入的半行 / 坏行，跳过
    }
    if (typeof entry.id !== 'string') continue; // session header 等没有 id
    byId.set(entry.id, entry);
    leafId = entry.id; // append-only：最后一条带 id 的 entry 就是当前 leaf
  }
  if (!leafId) return [];

  // 从 leaf 沿 parentId 走到根，得到"当前分支"的有序 entry
  const path: RawEntry[] = [];
  const seen = new Set<string>();
  let cursor: string | null = leafId;
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    const current: RawEntry = byId.get(cursor)!;
    path.push(current);
    cursor = current.parentId ?? null;
  }
  path.reverse();

  const messages: PiBranchMessage[] = [];
  const toolParts = new Map<string, ToolPart>();
  // 一轮里 pi 会把「工具调用」和「最终正文」拆成多条 assistant entry；这里合并成一条，
  // 与流式（AI SDK 一轮=一条 UIMessage）一致——否则「过程折叠」在重载后会失效。
  let lastAssistant: PiBranchMessage | null = null;

  for (const entry of path) {
    if (entry.type !== 'message') continue;
    const role = entry.message?.role;

    if (role === 'user') {
      const parts: StoredPart[] = [];
      for (const block of blocks(entry.message?.content)) {
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push({ text: block.text, type: 'text' });
        } else if (block.type === 'image' && typeof block.data === 'string') {
          const mimeType = typeof block.mimeType === 'string' ? block.mimeType : 'image/png';
          parts.push({ mediaType: mimeType, type: 'file', url: `data:${mimeType};base64,${block.data}` });
        }
      }
      if (parts.length > 0) messages.push({ createdAt: entry.timestamp ?? null, id: entry.id!, parts, role: 'user' });
      lastAssistant = null;
      continue;
    }

    if (role === 'assistant') {
      const parts: StoredPart[] = [];
      for (const block of blocks(entry.message?.content)) {
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push({ text: block.text, type: 'text' });
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
          parts.push({ text: block.thinking, type: 'reasoning' });
        } else if (
          block.type === 'toolCall' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string'
        ) {
          const toolPart: ToolPart = {
            input: block.arguments,
            state: 'input-available',
            toolCallId: block.id,
            toolName: block.name,
            type: 'tool',
          };
          parts.push(toolPart);
          toolParts.set(block.id, toolPart);
        }
      }
      // 失败的一轮（没有内容）也要透出错误，否则历史里整轮消失
      if (parts.length === 0 && typeof entry.message?.errorMessage === 'string') {
        parts.push({ text: `> ⚠️ 上一轮调用模型失败：${entry.message.errorMessage}`, type: 'text' });
      }
      if (parts.length === 0) continue;
      if (lastAssistant) {
        // 同一轮的后续 assistant entry（工具调用后的正文）→ 并进上一条
        lastAssistant.parts.push(...parts);
      } else {
        lastAssistant = { createdAt: entry.timestamp ?? null, id: entry.id!, parts, role: 'assistant' };
        messages.push(lastAssistant);
      }
      continue;
    }

    if (role === 'toolResult') {
      const callId = typeof entry.message?.toolCallId === 'string' ? entry.message.toolCallId : null;
      if (!callId) continue;
      const target = toolParts.get(callId);
      if (!target) continue;
      const text = textOfBlocks(entry.message?.content);
      const isError = entry.message?.isError === true;
      target.state = isError ? 'output-error' : 'output-available';
      target.output = isError ? undefined : text.slice(0, 4000);
      target.errorText = isError ? text || '工具执行失败' : undefined;
      target.toolMetadata = entry.message?.details;
    }
  }

  return messages;
}

/**
 * 删除某会话对应的 pi 会话文件（删 topic 时联动清理）。
 * 找不到也算成功（返回 false 表示"本来就没有"）。
 */
export function deletePiSessionFile(topicId: string): boolean {
  if (!PI_ISOLATED) return false;
  const file = findSessionFile(topicId);
  if (!file) return false;
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
