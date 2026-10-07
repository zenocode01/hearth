'use client';

import { Flexbox } from '@lobehub/ui';
import { Skeleton, SkeletonAvatar } from '@lobehub/ui/base-ui';

interface ListSkeletonProps {
  /** 行数（默认 3） */
  rows?: number;
  /** small：会话列表那种窄行；default：Agent 列表那种带头像卡片的行 */
  size?: 'default' | 'small';
}

/**
 * 列表骨架：形状对齐真实列表（头像方块 + 两行文字），避免"骨架跳动"。
 * 参考 refs 里 LobeHub 的 SkeletonList（头像 + 一行文本的行骨架）。
 */
export function ListSkeleton({ rows = 3, size = 'default' }: ListSkeletonProps) {
  const small = size === 'small';

  return (
    <Flexbox data-testid="list-skeleton" gap={small ? 2 : 8}>
      {Array.from({ length: rows }, (_, index) => (
        <Flexbox
          align="center"
          gap={12}
          horizontal
          key={index}
          style={{ minHeight: small ? 36 : undefined, padding: small ? '6px 8px' : 12 }}
        >
          <SkeletonAvatar animated shape="square" size={small ? 18 : 40} />
          <Flexbox flex={1} gap={6} style={{ minWidth: 0 }}>
            <Skeleton animated height={12} radius={4} width={small ? '55%' : 150} />
            {!small && <Skeleton animated height={10} radius={4} width="75%" />}
          </Flexbox>
        </Flexbox>
      ))}
    </Flexbox>
  );
}
