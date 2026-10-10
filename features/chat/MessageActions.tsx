'use client';

import { ActionIconGroup, type ActionIconGroupItemType } from '@lobehub/ui';
import { Copy, Pencil, RotateCcw, Split, TextCursorInput, Trash2 } from 'lucide-react';
import { memo, useMemo, type ReactNode } from 'react';

export type MessageActionKey = 'branch' | 'copy' | 'delete' | 'edit' | 'regenerate' | 'restore';

/** 每个动作的图标/文案/是否危险（声明式，集中一处）。 */
const ACTION_META: Record<
  MessageActionKey,
  { danger?: boolean; icon: ReactNode; label: string }
> = {
  branch: { icon: <Split size={16} />, label: '分支' },
  copy: { icon: <Copy size={16} />, label: '复制' },
  delete: { danger: true, icon: <Trash2 size={16} />, label: '删除' },
  edit: { icon: <Pencil size={16} />, label: '编辑' },
  regenerate: { icon: <RotateCcw size={16} />, label: '重新生成' },
  restore: { icon: <TextCursorInput size={16} />, label: '放回输入框' },
};

/**
 * 声明式 slot（对标 LobeHub 的 action slots）：按 role / runtime 决定显示哪些动作，
 * 而不是把条件散在渲染里。加/减动作改这里即可。
 */
export function buildMessageActions(ctx: {
  canBranch: boolean;
  canEdit: boolean;
  role: 'assistant' | 'user';
}): MessageActionKey[] {
  const slots: MessageActionKey[] = [];
  if (ctx.role === 'user') {
    slots.push('restore');
    // pi 主题的历史在 pi 会话里，改不了单条消息 → 不给编辑
    if (ctx.canEdit) slots.push('edit');
  } else {
    slots.push('regenerate');
  }
  slots.push('copy');
  // pi 主题的分支走会话树面板（同 topic 内兄弟分支），这里不重复给入口
  if (ctx.canBranch) slots.push('branch');
  slots.push('delete');
  return slots;
}

interface MessageActionsProps {
  /** 生成中时禁用"重新生成" */
  busy?: boolean;
  /** 是否显示"分支"（pi 主题隐藏，改用会话树面板） */
  canBranch?: boolean;
  /** 是否显示"编辑"（pi 主题隐藏） */
  canEdit?: boolean;
  onAction: (key: MessageActionKey) => void;
  role: 'assistant' | 'user';
}

/** 消息操作栏（参考 refs 的 MessageActionBar）。悬停显示，见 globals.css 的 .hearth-msg。 */
export const MessageActions = memo(
  ({ role, busy, canBranch = true, canEdit = true, onAction }: MessageActionsProps) => {
    const items = useMemo<ActionIconGroupItemType[]>(
      () =>
        buildMessageActions({ canBranch, canEdit, role }).map((key) => {
          const meta = ACTION_META[key];
          return {
            danger: meta.danger,
            disabled: key === 'regenerate' && busy,
            icon: meta.icon,
            key,
            label: meta.label,
          };
        }),
      [busy, canBranch, canEdit, role],
    );

    return (
      <ActionIconGroup
        items={items}
        size="small"
        variant="borderless"
        onActionClick={(action) => onAction(action.key as MessageActionKey)}
      />
    );
  },
);

MessageActions.displayName = 'MessageActions';
