'use client';

import { Icon, Text } from '@lobehub/ui';
import type { UIMessage } from 'ai';
import { MessageCircleQuestion } from 'lucide-react';
import { memo, useMemo } from 'react';

import { QuestionForm } from './QuestionForm';
import { findPendingQuestion } from './interventions';

/**
 * 输入框上方的提问栏（参考 refs 的 Conversation/InterventionBar）：
 * 有等待回答的提问时出现，回答在栏里完成；消息里的工具卡片只保留结果，
 * 这样回答入口永远在同一个位置（不用在长对话里找卡片）。
 */
export const QuestionBar = memo(({ messages }: { messages: UIMessage[] }) => {
  const pending = useMemo(() => findPendingQuestion(messages), [messages]);
  if (!pending) return null;

  return (
    <div style={{ padding: '0 12px 6px' }}>
      <div
        style={{
          background: 'var(--ant-color-primary-bg, rgba(22, 119, 255, 0.06))',
          border: '1px solid var(--ant-color-primary-border, rgba(22, 119, 255, 0.3))',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 10,
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
          <Icon icon={MessageCircleQuestion} size={14} />
          <Text style={{ fontSize: 12.5, fontWeight: 600 }}>需要你的回答</Text>
        </div>
        <QuestionForm input={pending.input} requestId={pending.requestId} runId={pending.runId} />
      </div>
    </div>
  );
});

QuestionBar.displayName = 'QuestionBar';
