'use client';

import { Flexbox } from '@lobehub/ui';
import { Skeleton, SkeletonAvatar } from '@lobehub/ui/base-ui';

/**
 * Agent 编辑页骨架：形状对齐真实布局（标题 + 预览卡 + 两张表单卡）。
 * 编辑已有 Agent 时加载数据期间显示；也被 `app/agents/[id]/loading.tsx` 复用。
 */
export function AgentEditorSkeleton() {
  return (
    <Flexbox
      data-testid="editor-skeleton"
      gap={16}
      style={{ margin: '0 auto', maxWidth: 760, padding: 24, width: '100%' }}
    >
      {/* 顶栏：返回 + 标题 + 按钮 */}
      <Flexbox align="center" horizontal justify="space-between">
        <Skeleton animated height={22} radius={6} width={140} />
        <Flexbox gap={8} horizontal>
          <Skeleton animated height={32} radius={8} width={72} />
          <Skeleton animated height={32} radius={8} width={72} />
        </Flexbox>
      </Flexbox>

      {/* 预览卡（头像 + 名称） */}
      <Flexbox
        align="center"
        gap={14}
        horizontal
        style={{
          background: 'var(--ant-color-bg-container, #fff)',
          border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <SkeletonAvatar animated shape="square" size={56} />
        <Flexbox flex={1} gap={8}>
          <Skeleton animated height={14} radius={4} width={180} />
          <Skeleton animated height={10} radius={4} width={260} />
        </Flexbox>
      </Flexbox>

      {/* 基本信息 / 人设 两张卡 */}
      <Skeleton animated height={220} radius={16} />
      <Skeleton animated height={160} radius={16} />
    </Flexbox>
  );
}
