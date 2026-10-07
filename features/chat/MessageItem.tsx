'use client';

import { Markdown } from '@lobehub/ui';
import type { UIMessage } from 'ai';
import { memo } from 'react';

import { ReasoningBlock } from './ReasoningBlock';

interface MessageItemProps {
  message: UIMessage;
  /** 发起本次请求的时间戳（只对最后一条 AI 消息有意义） */
  startedAt?: number;
}

/**
 * 渲染一条消息：用户为浅色气泡；AI 为推理（可收缩/展开）+ Markdown 正文。
 * 颜色用 antd 的 CSS 变量（--ant-color-*），随深浅色自动切换。
 */
export const MessageItem = memo(({ message, startedAt }: MessageItemProps) => {
  const isUser = message.role === 'user';

  const reasoning = message.parts
    .map((part) => (part.type === 'reasoning' ? part.text : ''))
    .join('');
  const text = message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('');

  const hasText = text.trim().length > 0;
  const hasReasoning = reasoning.trim().length > 0;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          background: isUser ? 'var(--ant-color-fill-secondary, rgba(0, 0, 0, 0.06))' : undefined,
          borderRadius: 12,
          maxWidth: '85%',
          padding: isUser ? '10px 14px' : '2px 0',
          whiteSpace: isUser ? 'pre-wrap' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          <span>{text}</span>
        ) : (
          <>
            {hasReasoning && (
              <ReasoningBlock startedAt={startedAt} text={reasoning} thinking={!hasText} />
            )}
            {hasText && (
              <Markdown animated variant="chat">
                {text}
              </Markdown>
            )}
          </>
        )}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';
