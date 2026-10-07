'use client';

import { Flexbox } from '@lobehub/ui';
import { Skeleton, SkeletonAvatar } from '@lobehub/ui/base-ui';

import { ListSkeleton } from '@/components/ListSkeleton';
import { MessageSkeleton } from '@/features/chat/MessageSkeleton';

/** /chat 路由级加载态：形状对齐真实布局（左侧栏 + 消息区），首次进入时也像"已经在用" */
export default function ChatLoading() {
  return (
    <div style={{ display: 'flex', height: '100dvh' }}>
      {/* 左侧栏：切换器 + 新建按钮 + 会话列表 */}
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

      {/* 消息区 */}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0, padding: 16 }}>
        <MessageSkeleton />
      </div>
    </div>
  );
}
