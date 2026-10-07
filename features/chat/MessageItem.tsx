'use client';

import { Markdown } from '@lobehub/ui';
import type { UIMessage } from 'ai';
import { memo } from 'react';

interface MessageItemProps {
  message: UIMessage;
}

/**
 * 渲染一条消息：用户为浅色气泡，AI 为无气泡的 Markdown（流式平滑）。
 * 颜色用 antd 的 CSS 变量（如 --ant-color-fill-secondary），随深浅色自动切换。
 */
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
          background: isUser ? 'var(--ant-color-fill-secondary, rgba(0, 0, 0, 0.06))' : undefined,
          borderRadius: 12,
          maxWidth: '85%',
          padding: isUser ? '10px 14px' : '2px 0',
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
