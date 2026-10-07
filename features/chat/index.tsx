'use client';

import { useChat } from '@ai-sdk/react';
import { Button, Text } from '@lobehub/ui';
import { useEffect, useRef } from 'react';

import { ChatComposer } from './ChatComposer';
import { EmptyState } from './EmptyState';
import { MessageItem } from './MessageItem';

/** 聊天主视图：消息列表 + 错误条 + 输入框（见 .agents/skills/chat-streaming）。 */
export function ChatView() {
  const { messages, sendMessage, status, error, stop, clearError, regenerate } = useChat();
  const busy = status === 'submitted' || status === 'streaming';
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新内容到达时滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: 16,
          overflowY: 'auto',
          padding: 16,
        }}
      >
        {messages.length === 0 && !busy ? (
          <EmptyState />
        ) : (
          messages.map((message) => <MessageItem key={message.id} message={message} />)
        )}
        {status === 'submitted' && <Text type="secondary">正在思考…</Text>}
      </div>

      {error && (
        <div
          style={{
            alignItems: 'center',
            background: 'rgba(255, 77, 79, 0.12)',
            borderRadius: 8,
            color: '#ff4d4f',
            display: 'flex',
            fontSize: 13,
            gap: 12,
            justifyContent: 'space-between',
            margin: '0 12px 4px',
            padding: '8px 12px',
          }}
        >
          <span>{error.message}</span>
          <span style={{ display: 'flex', flexShrink: 0, gap: 8 }}>
            {messages.length > 0 && (
              <Button
                size="small"
                onClick={() => {
                  clearError();
                  void regenerate();
                }}
              >
                重试
              </Button>
            )}
            <Button size="small" onClick={clearError}>
              知道了
            </Button>
          </span>
        </div>
      )}

      <ChatComposer busy={busy} onSend={(text) => void sendMessage({ text })} onStop={stop} />
    </div>
  );
}
