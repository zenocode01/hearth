'use client';

import { Block, Icon, Text } from '@lobehub/ui';
import type { UIMessage } from 'ai';
import { ChevronDown, ListChecks } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

export interface TodoItem {
  done: boolean;
  id: number;
  text: string;
}

/** 从消息里找最近一次 todo 清单（pi 的 todo 扩展把完整清单放在工具结果的 details 里）。 */
export function latestTodos(messages: UIMessage[]): TodoItem[] | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const { parts } = messages[index];
    // 同一条消息里也要从后往前找（一次回复可能连着调用多次 todo）
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const metadata = (parts[partIndex] as { toolMetadata?: { todos?: unknown } }).toolMetadata;
      if (Array.isArray(metadata?.todos)) return metadata.todos as TodoItem[];
    }
  }
  return null;
}

/**
 * 输入框上方的任务清单面板（参考 refs 的 Conversation/TodoProgress）：
 * 显示最近一次 todo 的进度（完成数/总数），点开看完整清单。
 * pi 的 todo 扩展在全部完成时会自动清空清单 → 这里列表为空就整块隐藏。
 */
export const TodoPanel = memo(({ messages }: { messages: UIMessage[] }) => {
  const todos = useMemo(() => latestTodos(messages), [messages]);
  const [open, setOpen] = useState(true);

  if (!todos || todos.length === 0) return null;

  const done = todos.filter((todo) => todo.done).length;

  return (
    <div style={{ padding: '0 12px 6px' }}>
      <div
        style={{
          background: 'var(--ant-color-bg-container, #fff)',
          border: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.08))',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            alignItems: 'center',
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            gap: 8,
            padding: '6px 10px',
            width: '100%',
          }}
        >
          <Icon icon={ListChecks} size={14} />
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>任务清单</span>
          <span
            style={{
              color: 'var(--ant-color-text-description, rgba(0, 0, 0, 0.45))',
              fontSize: 12,
            }}
          >
            {done}/{todos.length} 已完成
          </span>
          <span
            style={{
              display: 'inline-flex',
              marginLeft: 'auto',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <Icon icon={ChevronDown} size={14} />
          </span>
        </button>

        {open && (
          <div
            className="hearth-scroll hearth-collapse-in"
            style={{
              borderTop: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              maxHeight: 'min(30vh, 220px)',
              overflowY: 'auto',
              padding: '6px 10px 8px',
            }}
          >
            {todos.map((todo) => (
              <div key={todo.id} style={{ alignItems: 'flex-start', display: 'flex', gap: 8 }}>
                <Block
                  align="center"
                  flex="none"
                  height={16}
                  horizontal
                  justify="center"
                  style={{ marginTop: 2 }}
                  variant="borderless"
                  width={16}
                >
                  <Text style={{ fontSize: 12 }}>{todo.done ? '✓' : '○'}</Text>
                </Block>
                <Text
                  style={{
                    fontSize: 12.5,
                    opacity: todo.done ? 0.45 : 1,
                    textDecoration: todo.done ? 'line-through' : undefined,
                  }}
                >
                  {todo.text}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

TodoPanel.displayName = 'TodoPanel';
