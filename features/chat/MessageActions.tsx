'use client';

import { ActionIconGroup, type ActionIconGroupItemType } from '@lobehub/ui';
import { Copy, RotateCcw, TextCursorInput, Trash2 } from 'lucide-react';
import { memo, useMemo } from 'react';

export type MessageActionKey = 'copy' | 'delete' | 'regenerate' | 'restore';

interface MessageActionsProps {
  /** 生成中时禁用"重新生成" */
  busy?: boolean;
  onAction: (key: MessageActionKey) => void;
  role: 'assistant' | 'user';
}

/** 消息操作栏（参考 refs 的 MessageActionBar，取常用动作）。悬停显示，见 globals.css 的 .pi-msg。 */
export const MessageActions = memo(({ role, busy, onAction }: MessageActionsProps) => {
  const items = useMemo(() => {
    const list: ActionIconGroupItemType[] = [
      { icon: <Copy size={16} />, key: 'copy', label: '复制' },
    ];

    if (role === 'user') {
      list.push({ icon: <TextCursorInput size={16} />, key: 'restore', label: '放回输入框' });
    } else {
      list.push({
        disabled: busy,
        icon: <RotateCcw size={16} />,
        key: 'regenerate',
        label: '重新生成',
      });
    }

    list.push({ danger: true, icon: <Trash2 size={16} />, key: 'delete', label: '删除' });

    return list;
  }, [busy, role]);

  return (
    <ActionIconGroup
      size="small"
      variant="borderless"
      items={items}
      onActionClick={(action) => onAction(action.key as MessageActionKey)}
    />
  );
});

MessageActions.displayName = 'MessageActions';
