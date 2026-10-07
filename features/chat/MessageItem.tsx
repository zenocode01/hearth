'use client';

import { Markdown } from '@lobehub/ui';
import type { UIMessage } from 'ai';
import { memo } from 'react';

interface MessageItemProps {
  message: UIMessage;
}

/** 渲染一条消息：用户为纯文本气泡，AI 为 Markdown（流式平滑）。 */
export const MessageItem = memo(({ message }: MessageItemProps) => {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          background: isUser
            ? 'var(--pi-vars-colorPrimary, #1677ff)'
            : 'var(--pi-vars-colorFillTertiary, rgba(0,0,0,0.04))',
          borderRadius: 12,
          color: isUser ? '#fff' : 'inherit',
          maxWidth: '85%',
          padding: '10px 14px',
          whiteSpace: isUser ? 'pre-wrap' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {message.parts.map((part, index) => {
          if (part.type !== 'text') return null;
          if (isUser) return <span key={index}>{part.text}</span>;
          return (
            <Markdown animated key={index} variant="chat">
              {part.text}
            </Markdown>
          );
        })}
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';
