'use client';

import { ActionIconGroup, type ActionIconGroupItemType } from '@lobehub/ui';
import { Copy, RotateCcw, Split, TextCursorInput, Trash2 } from 'lucide-react';
import { memo, useMemo } from 'react';

export type MessageActionKey = 'branch' | 'copy' | 'delete' | 'regenerate' | 'restore';

interface MessageActionsProps {
  /** 生成中时禁用"重新生成" */
  busy?: boolean;
  /** 是否显示"分支"（pi 主题的分支走会话树面板，这里隐藏） */
  canBranch?: boolean;
  /** 是否显示"删除"（pi 主题的消息删不掉——历史在 pi 那边，这里隐藏） */
  canDelete?: boolean;
  onAction: (key: MessageActionKey) => void;
  role: 'assistant' | 'user';
}

/** 消息操作栏（参考 refs 的 MessageActionBar，取常用动作）。悬停显示，见 globals.css 的 .hearth-msg。 */
export const MessageActions = memo(
  ({ role, busy, canBranch = true, canDelete = true, onAction }: MessageActionsProps) => {
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

      // 从这条消息派生一个分支会话（复制到此处为止，原会话不受影响）
      // pi 主题的分支走会话树面板（同 topic 内兄弟分支），这里不重复给入口
      if (canBranch) {
        list.push({ icon: <Split size={16} />, key: 'branch', label: '分支' });
      }

      // pi 主题的消息删不掉（历史在 pi 的会话文件里），隐藏这个动作避免点了没反应
      if (canDelete) {
        list.push({ danger: true, icon: <Trash2 size={16} />, key: 'delete', label: '删除' });
      }

      return list;
    }, [busy, canBranch, canDelete, role]);

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
