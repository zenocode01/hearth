'use client';

import { Flexbox } from '@lobehub/ui';
import { Skeleton, SkeletonAvatar } from '@lobehub/ui/base-ui';

import { ListSkeleton } from '@/components/ListSkeleton';
import { useIsMobile } from '@/components/useMediaQuery';
import { MessageSkeleton } from '@/features/chat/MessageSkeleton';

/** /chat 路由级加载态：形状对齐真实布局（窄屏没有侧栏，与 ChatView 的抽屉布局一致） */
export default function ChatLoading() {
  const isMobile = useIsMobile();

  return (
    <div style={{ display: 'flex', height: '100dvh' }}>
      {/* 左侧栏：只在桌面显示（手机上侧栏是抽屉） */}
      {!isMobile && (
        <div
          style={{
            borderRight: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            gap: 8,
            padding: 8,
            width: 240,
          }}
        >
          <Flexbox align="center" gap={8} horizontal style={{ padding: 6 }}>
            <SkeletonAvatar animated shape="square" size={24} />
            <Skeleton animated height={12} radius={4} width={90} />
          </Flexbox>
          <Skeleton animated height={32} radius={8} width="100%" />
          <ListSkeleton rows={6} size="small" />
        </div>
      )}

      {/* 消息区 */}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
            display: 'flex',
            flexShrink: 0,
            gap: 8,
            height: 49,
            padding: '8px 12px',
          }}
        >
          {isMobile && <Skeleton animated height={20} radius={6} width={20} />}
          <Skeleton animated height={14} radius={4} width={64} />
        </div>
        <div style={{ flex: 1, padding: 16 }}>
          <MessageSkeleton />
        </div>
      </div>
    </div>
  );
}
