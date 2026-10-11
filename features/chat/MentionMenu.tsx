'use client';

import { memo } from 'react';

import type { MentionCategory, MentionItem } from './mention';

interface MentionMenuProps {
  /** 键盘选中的项在**展平顺序**里的下标 */
  activeIndex: number;
  categories: MentionCategory[];
  onHover: (index: number) => void;
  onSelect: (item: MentionItem) => void;
}

/**
 * `@` 提及菜单（参考 refs 的 MentionMenu：按类别分组，Agent / 会话分开）。
 * 位置与斜杠菜单一致：贴在输入框左上、向上展开。
 */
export const MentionMenu = memo(({ activeIndex, categories, onHover, onSelect }: MentionMenuProps) => {
  // 展平顺序必须与父组件的键盘上下顺序一致（类别顺序 → 类别内顺序）
  let index = -1;

  return (
    <div
      style={{
        background: 'var(--ant-color-bg-elevated, #fff)',
        border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
        borderRadius: 8,
        bottom: '100%',
        boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        left: 0,
        marginBottom: 6,
        maxHeight: 300,
        overflowY: 'auto',
        padding: 4,
        position: 'absolute',
        width: 340,
        zIndex: 11,
      }}
    >
      {categories.map((category) => (
        <div key={category.key}>
          <div
            style={{
              alignItems: 'baseline',
              color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
              display: 'flex',
              fontSize: 11,
              gap: 6,
              padding: '4px 8px 2px',
            }}
          >
            <span>{category.label}</span>
            {category.hint && <span style={{ opacity: 0.8 }}>· {category.hint}</span>}
          </div>
          {category.items.map((item) => {
            index += 1;
            const active = index === activeIndex;
            return (
              <div
                key={item.key}
                onMouseDown={(event) => {
                  // 别让 textarea 先失焦（否则光标位置丢，插入位置就错了）
                  event.preventDefault();
                  onSelect(item);
                }}
                onMouseEnter={() => onHover(index)}
                style={{
                  alignItems: 'center',
                  background: active
                    ? 'var(--ant-color-fill-tertiary, rgba(0,0,0,0.04))'
                    : undefined,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 8,
                  padding: '6px 8px',
                }}
              >
                {item.icon && (
                  <span style={{ alignItems: 'center', display: 'inline-flex', flexShrink: 0 }}>
                    {item.icon}
                  </span>
                )}
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </span>
                {item.description && (
                  <span
                    style={{
                      color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
                      flexShrink: 0,
                      fontSize: 12,
                    }}
                  >
                    {item.description}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

MentionMenu.displayName = 'MentionMenu';
