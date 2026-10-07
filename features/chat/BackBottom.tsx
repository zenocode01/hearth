'use client';

import { Button } from '@lobehub/ui';
import { memo } from 'react';

const ArrowDown = () => (
  <svg
    aria-hidden
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="16"
  >
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </svg>
);

interface BackBottomProps {
  onClick: () => void;
  /** 不在底部时显示 */
  visible: boolean;
}

/** "回到最新"按钮：固定悬在消息区右下角，不随滚动移动（参考 refs 的 BackBottom，简化版）。 */
export const BackBottom = memo(({ visible, onClick }: BackBottomProps) => (
  <Button
    aria-label="回到最新"
    icon={<ArrowDown />}
    shape="circle"
    title="回到最新"
    onClick={onClick}
    style={{
      backdropFilter: 'blur(8px)',
      bottom: 20,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.16)',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      position: 'absolute',
      right: 20,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      zIndex: 5,
    }}
  />
));

BackBottom.displayName = 'BackBottom';
