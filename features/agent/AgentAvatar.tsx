'use client';

import { FluentEmoji } from '@lobehub/ui';
import { memo } from 'react';

interface AgentAvatarProps {
  avatar?: string | null;
  /** 头像底色（为空时用中性底色） */
  background?: string | null;
  size?: number;
}

/** Agent 头像：带底色的圆角方块 + FluentEmoji（参考 LobeHub 的头像样式）。 */
export const AgentAvatar = memo(({ avatar, background, size = 32 }: AgentAvatarProps) => (
  <span
    style={{
      alignItems: 'center',
      background: background || 'var(--ant-color-fill-tertiary, rgba(0, 0, 0, 0.04))',
      borderRadius: Math.round(size * 0.28),
      display: 'inline-flex',
      flexShrink: 0,
      height: size,
      justifyContent: 'center',
      width: size,
    }}
  >
    <FluentEmoji emoji={avatar || '😀'} size={Math.round(size * 0.68)} />
  </span>
));

AgentAvatar.displayName = 'AgentAvatar';
