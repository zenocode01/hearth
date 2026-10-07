'use client';

import { FluentEmoji } from '@lobehub/ui';
import { memo } from 'react';

import { getAgentIconOption } from './agentIcons';

interface AgentAvatarProps {
  avatar?: string | null;
  /** 头像底色（为空时用中性底色；品牌图标用自己的品牌色） */
  background?: string | null;
  size?: number;
}

/**
 * Agent 头像：带底色的圆角方块。
 * - `avatar` 存 `icon:<key>` → 渲染外部 Agent 的 logo（`@lobehub/icons` 的品牌头像）
 * - 其它情况按 emoji 渲染（FluentEmoji）
 */
export const AgentAvatar = memo(({ avatar, background, size = 32 }: AgentAvatarProps) => {
  const iconOption = getAgentIconOption(avatar);

  if (iconOption) {
    const { Icon } = iconOption;
    return (
      <Icon.Avatar
        shape="square"
        size={size}
        style={{ borderRadius: Math.round(size * 0.28) }}
      />
    );
  }

  return (
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
  );
});

AgentAvatar.displayName = 'AgentAvatar';
