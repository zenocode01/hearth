'use client';

import { Button, Icon } from '@lobehub/ui';
import { ArrowDown } from 'lucide-react';
import { memo } from 'react';

interface BackBottomProps {
  onClick: () => void;
  /** 不在底部时显示 */
  visible: boolean;
}

/** "回到最新"按钮：固定悬在消息区右下角，不随滚动移动（参考 refs 的 BackBottom，简化版）。 */
export const BackBottom = memo(({ visible, onClick }: BackBottomProps) => (
  <Button
    aria-label="回到最新"
    icon={<Icon icon={ArrowDown} size={16} />}
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
