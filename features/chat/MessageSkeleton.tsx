'use client';

import { Flexbox } from '@lobehub/ui';
import { Skeleton, SkeletonAvatar } from '@lobehub/ui/base-ui';

/**
 * 消息区骨架：模拟「用户气泡 + 助手回复（头像 + 多行）」，切换会话加载历史时显示。
 * 形状对齐真实消息布局，避免加载完的跳动（参考 refs 的 Conversation Skeleton List）。
 */
export function MessageSkeleton() {
  return (
    <Flexbox data-testid="message-skeleton" gap={20}>
      {/* 用户消息：右侧气泡 */}
      <Flexbox align="flex-end" gap={8}>
        <Skeleton animated height={38} radius={12} width="48%" />
      </Flexbox>

      {/* 助手回复：左对齐，头像 + 多行文本 */}
      <Flexbox gap={10} horizontal>
        <SkeletonAvatar animated shape="square" size={28} />
        <Flexbox flex={1} gap={8}>
          <Skeleton animated height={12} radius={4} width="92%" />
          <Skeleton animated height={12} radius={4} width="78%" />
          <Skeleton animated height={12} radius={4} width="45%" />
        </Flexbox>
      </Flexbox>
    </Flexbox>
  );
}
