'use client';

import { Flexbox } from '@lobehub/ui';
import { Skeleton } from '@lobehub/ui/base-ui';

import { ListSkeleton } from '@/components/ListSkeleton';

/** /agents 路由级加载态（`app/agents/loading.tsx`）：形状对齐真实列表页 */
export default function AgentsLoading() {
  return (
    <Flexbox
      gap={16}
      style={{ margin: '0 auto', maxWidth: 880, padding: 24, width: '100%' }}
    >
      {/* 顶栏：标题 + 两个按钮 */}
      <Flexbox align="center" horizontal justify="space-between">
        <Skeleton animated height={22} radius={6} width={120} />
        <Flexbox gap={8} horizontal>
          <Skeleton animated height={32} radius={8} width={112} />
          <Skeleton animated height={32} radius={8} width={112} />
        </Flexbox>
      </Flexbox>

      {/* 列表 */}
      <ListSkeleton rows={3} />
    </Flexbox>
  );
}
