'use client';

import { AgentEditorSkeleton } from '@/features/agent/AgentEditorSkeleton';

/** /agents/[id] 路由级加载态：直接复用编辑页骨架（同一个形状，避免二次闪烁） */
export default function AgentEditorLoading() {
  return <AgentEditorSkeleton />;
}
