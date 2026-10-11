import type { ReactNode } from 'react';

/**
 * 输入框里的 `@提及`：候选数据结构 + 识别触发词 / 文本替换 / 候选过滤（纯逻辑，不依赖 React）。
 * 交互部分在 `ChatComposer.tsx`，菜单外观在 `MentionMenu.tsx`。
 */

export interface MentionItem {
  /** 同一条数据的说明（副标题，如 Agent 的模型） */
  description?: string;
  icon?: ReactNode;
  /** 数据本身的 id（Agent id / 会话 id）——选中后要用它做动作 */
  id: string;
  /** React 列表 key（`<类型>-<id>`，两类数据可能撞 id） */
  key: string;
  /** 插入到输入框的文本（如 `@周五的会议`）；缺省 = 只做动作不插文本（如切换 Agent） */
  insert?: string;
  kind: 'agent' | 'topic';
  label: string;
}

export interface MentionCategory {
  /** 类别的一句话说明（如「切换本会话的人设」） */
  hint?: string;
  items: MentionItem[];
  key: string;
  label: string;
}

export interface MentionQuery {
  /** 查询词（`@` 与光标之间的那段） */
  query: string;
  /** `@` 在文本里的下标 */
  start: number;
}

/**
 * 光标前是不是正在打一个 `@提及`：
 * `@` 必须在行首或空白之后（避免把邮箱、`a@b` 当提及），
 * 且 `@` 到光标之间不能有空白（打了空格就是普通文本了）。
 */
export function detectMention(value: string, caret: number): MentionQuery | null {
  const clamped = Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, clamped);
  const start = before.lastIndexOf('@');
  if (start < 0) return null;
  const prev = start === 0 ? '' : before[start - 1];
  if (prev && !/\s/.test(prev)) return null;
  const query = before.slice(start + 1);
  if (/[\s@]/.test(query)) return null;
  return { query, start };
}

/**
 * 把 `@查询词` 换成 `insert`（缺省 = 只抹掉触发词，用于「纯动作」类型的候选，如切换 Agent），
 * 返回新文本与替换后的光标位置。
 */
export function applyMention(
  value: string,
  mention: MentionQuery,
  insert?: string,
): { caret: number; text: string } {
  const before = value.slice(0, mention.start);
  const after = value.slice(mention.start + 1 + mention.query.length);
  // 后面本来就是空格时不要补成两个
  const inserted = insert ? (after.startsWith(' ') ? insert : `${insert} `) : '';
  return { caret: before.length + inserted.length, text: `${before}${inserted}${after}` };
}

/** 按查询词过滤分类（每类最多 `limit` 条）；返回过滤后的分类与展平顺序（键盘上下走这个）。 */
export function filterMentionGroups(
  categories: MentionCategory[],
  query: string,
  limit = 6,
): { categories: MentionCategory[]; items: MentionItem[] } {
  const keyword = query.trim().toLowerCase();
  const groups: MentionCategory[] = [];
  const items: MentionItem[] = [];
  for (const category of categories) {
    const matched = category.items
      .filter(
        (item) => !keyword || `${item.label} ${item.description ?? ''}`.toLowerCase().includes(keyword),
      )
      .slice(0, limit);
    if (matched.length === 0) continue;
    groups.push({ ...category, items: matched });
    items.push(...matched);
  }
  return { categories: groups, items };
}

/**
 * 从文本里认领「引用了哪些会话」：`@` 在行首/空白之后、后面正好跟着某个会话标题。
 *
 * 为什么发送时现认、不另存状态：token 是普通文本，用户可能删掉、切会话时草稿又从
 * localStorage 恢复回来——存一份引用状态就会和文本对不上（切走再切回，token 还在但引用失效）。
 * 现认的好处是刷新、切会话、手打 `@标题` 都一致；代价是两个会话标题相同时会同时引用上。
 */
export function extractTopicRefs<T extends { id: string; title: string }>(
  value: string,
  topics: T[],
  options: { excludeTopicId?: string | null } = {},
): T[] {
  const out: T[] = [];
  for (const topic of topics) {
    if (!topic.title || topic.id === options.excludeTopicId) continue;
    const needle = `@${topic.title}`;
    for (let from = 0; ; ) {
      const at = value.indexOf(needle, from);
      if (at < 0) break;
      const prev = at === 0 ? '' : value[at - 1];
      if (!prev || /\s/.test(prev)) {
        out.push(topic);
        break;
      }
      from = at + 1;
    }
  }
  return out;
}
