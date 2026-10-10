'use client';

import { Block, Flexbox, Icon, Popover, Text } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { ChevronDown, GitBranch } from 'lucide-react';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';

/**
 * 会话树面板（pi 主题专用，方案见 docs/analysis/pi-session-tree.md）。
 *
 * pi 把会话存成**一棵树**（每条 entry 带 parentId）。这里读 `GET /api/topics/[id]/session`
 * 把树画出来，点某条**用户消息**就走 `POST navigate` 从它那里开兄弟分支（pi 的 `/tree` 语义），
 * 并把那条消息的文本放回输入框，供编辑后重新发送。
 *
 * 只有 pi（RPC）会话有树；其它 runtime 的会话后端会返回 404，面板自动隐藏。
 */

interface TreeNode {
  children?: TreeNode[];
  entry?: {
    id?: string;
    message?: { content?: unknown; role?: string };
    parentId?: string | null;
    type?: string;
  };
}

interface Snapshot {
  forkMessages: Array<{ entryId: string; text: string }>;
  leafId: string | null;
  tree: TreeNode[];
}

interface SessionTreeProps {
  /** 把它点中的 user 消息文本放回输入框（父组件负责改草稿 + 聚焦） */
  onBranch: (text: string) => void;
  /** 每次流式回复结束 +1，用于刷新树 */
  refreshKey?: number;
  topicId: string;
}

/** 取出消息的纯文本（content 可能是字符串，也可能是 [{type,text}] 块）。 */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      const item = block as { text?: unknown; type?: unknown };
      return item?.type === 'text' && typeof item.text === 'string' ? item.text : '';
    })
    .join('');
}

/** 一行该显示什么；返回 null 表示这行是噪音（label / thinking_level 等），只递归子节点。 */
function describeEntry(entry: NonNullable<TreeNode['entry']>): {
  kind: 'assistant' | 'marker' | 'user';
  text: string;
} | null {
  if (entry.type === 'message') {
    const role = entry.message?.role;
    if (role === 'user' || role === 'assistant') {
      const text = textOf(entry.message?.content);
      // 空文本（纯工具调用 / 纯图片）不进树——user 空文本也不能当分支点
      return text.trim() ? { kind: role, text } : null;
    }
    return null; // system / toolResult 不进树
  }
  if (entry.type === 'compaction') return { kind: 'marker', text: '上下文已压缩' };
  if (entry.type === 'branch_summary') return { kind: 'marker', text: '分支摘要' };
  return null;
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean || '（空）';
}

export const SessionTree = memo(({ topicId, refreshKey = 0, onBranch }: SessionTreeProps) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<'error' | 'loading' | 'ready'>('loading');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 后端说"这不是 pi 会话"就不显示入口 */
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/topics/${topicId}/session`);
      if (res.status === 404) {
        setAvailable(false);
        setStatus('ready');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setSnapshot((await res.json()) as Snapshot);
      setAvailable(true);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const branch = useCallback(
    async (entryId: string, text: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/topics/${topicId}/session`, {
          body: JSON.stringify({ action: 'navigate', entryId }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        const data = (await res.json()) as Snapshot & { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? '分支失败');
          return;
        }
        setSnapshot(data);
        setOpen(false);
        onBranch(text);
      } catch {
        toast.error('分支失败，请检查网络');
      } finally {
        setBusy(false);
      }
    },
    [busy, onBranch, topicId],
  );

  const renderNode = (node: TreeNode, depth: number, index: number): ReactNode => {
    const entry = node.entry ?? {};
    const described = describeEntry(entry);
    const isLeaf = !!entry.id && entry.id === snapshot?.leafId;
    const nodeKey = entry.id ?? `n-${depth}-${index}`;

    const row = described ? (
      <div
        key={`${nodeKey}-row`}
        style={{ alignItems: 'center', display: 'flex', gap: 6, minHeight: 24 }}
      >
        <Text
          style={{
            color:
              described.kind === 'user'
                ? 'var(--ant-color-text, rgba(0,0,0,0.88))'
                : described.kind === 'marker'
                  ? 'var(--ant-color-primary, #1677ff)'
                  : 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
            fontSize: 12,
          }}
          type={described.kind === 'user' ? undefined : 'secondary'}
        >
          {described.kind === 'user' ? '● ' : described.kind === 'marker' ? '⟳ ' : '○ '}
          {truncate(described.text)}
        </Text>
        {isLeaf && (
          <Text style={{ fontSize: 10.5 }} type="secondary">
            当前
          </Text>
        )}
        {described.kind === 'user' && entry.id && (
          <Text
            onClick={() => void branch(entry.id as string, described.text)}
            style={{
              color: 'var(--ant-color-primary, #1677ff)',
              cursor: busy ? 'default' : 'pointer',
              fontSize: 11,
            }}
          >
            从这里分支
          </Text>
        )}
      </div>
    ) : null;

    return (
      <div key={nodeKey} style={{ paddingLeft: depth > 0 ? 14 : 0 }}>
        {row}
        {(node.children ?? []).map((child, childIndex) => renderNode(child, depth + 1, childIndex))}
      </div>
    );
  };

  if (!available) return null;

  return (
    <Popover
      content={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto', padding: 12, width: 360 }}>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>会话树</Text>
          <Text style={{ fontSize: 11.5, lineHeight: 1.6 }} type="secondary">
            点某条用户消息「从这里分支」，会把它的文本放回输入框；编辑后发送即从该处开新分支，
            原分支保留。
          </Text>

          {status === 'loading' && (
            <Text style={{ fontSize: 12 }} type="secondary">
              读取中…
            </Text>
          )}
          {status === 'error' && (
            <Flexbox gap={8} horizontal>
              <Text style={{ fontSize: 12 }} type="secondary">
                读取失败
              </Text>
              <Text
                onClick={() => void load()}
                style={{ color: 'var(--ant-color-primary, #1677ff)', cursor: 'pointer', fontSize: 12 }}
              >
                重试
              </Text>
            </Flexbox>
          )}
          {status === 'ready' && (snapshot?.tree?.length ?? 0) === 0 && (
            <Text style={{ fontSize: 12 }} type="secondary">
              还没有会话记录（发第一条消息后出现）。
            </Text>
          )}
          {status === 'ready' && (snapshot?.tree ?? []).map((node, index) => renderNode(node, 0, index))}
        </div>
      }
      nativeButton={false}
      open={open}
      placement="topLeft"
      styles={{ content: { padding: 0 } }}
      trigger="click"
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <Block
        align="center"
        clickable
        gap={6}
        horizontal
        padding={6}
        title="会话树与分支"
        variant="borderless"
      >
        <Icon icon={GitBranch} size={16} />
        <Text style={{ fontSize: 12.5 }}>
          {status === 'ready' && snapshot
            ? `会话树 ${(snapshot.forkMessages ?? []).length} 分支点`
            : '会话树'}
        </Text>
        <Icon icon={ChevronDown} size={12} style={{ opacity: 0.5 }} />
      </Block>
    </Popover>
  );
});

SessionTree.displayName = 'SessionTree';
