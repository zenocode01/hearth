'use client';

import { useChat } from '@ai-sdk/react';
import { Button, Text } from '@lobehub/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ThemeControls } from '@/components/ThemeControls';

import { BackBottom } from './BackBottom';
import { ChatComposer } from './ChatComposer';
import { EmptyState } from './EmptyState';
import { MessageItem } from './MessageItem';

/** 距底多少像素内算"在底部" */
const BOTTOM_THRESHOLD = 32;

/** 聊天主视图：顶栏 + 消息列表（含滚动条/回到最新）+ 错误条 + 输入框。 */
export function ChatView() {
  const { messages, sendMessage, status, error, stop, clearError, regenerate } = useChat();
  const busy = status === 'submitted' || status === 'streaming';

  const lastMessage = messages[messages.length - 1];
  // 提交后 → 首条内容（含"推理"）到达前，必须有指示，否则看起来像卡住
  const waitingFirstToken =
    busy &&
    !(
      lastMessage?.role === 'assistant' &&
      lastMessage.parts.some(
        (part) =>
          (part.type === 'text' || part.type === 'reasoning') && part.text.trim().length > 0,
      )
    );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  // 用 ref 记录是否在底部：effect 只依赖 messages，避免与平滑滚动互相打断
  const atBottomRef = useRef(true);
  // 本次请求的发起时间：用于 AI 消息显示"已深度思考 N 秒"
  const requestStartedAtRef = useRef<number | null>(null);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ behavior: smooth ? 'smooth' : 'auto', top: el.scrollHeight });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    atBottomRef.current = near;
    setAtBottom(near);
  }, []);

  // 新内容到达时：只有用户本来就在底部才跟随（上翻阅读时不被打断）
  useEffect(() => {
    if (atBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    (text: string) => {
      // 自己发消息时，无论在哪儿都回到最新
      atBottomRef.current = true;
      setAtBottom(true);
      requestStartedAtRef.current = Date.now();
      void sendMessage({ text });
      requestAnimationFrame(() => scrollToBottom(false));
    },
    [scrollToBottom, sendMessage],
  );

  const handleRetry = useCallback(() => {
    clearError();
    requestStartedAtRef.current = Date.now();
    void regenerate();
  }, [clearError, regenerate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* 顶栏：主题控件在这里（不悬浮、不遮挡内容）。阶段 3 的 Agent 选择器也放这。 */}
      <div
        style={{
          alignItems: 'center',
          borderBottom: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
          display: 'flex',
          flexShrink: 0,
          justifyContent: 'space-between',
          padding: '8px 16px',
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: 600 }}>pi-web</Text>
        <ThemeControls />
      </div>

      {/* 消息区：relative 容器承载"回到最新"按钮 */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          className="pi-scroll"
          ref={scrollRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            height: '100%',
            overflowY: 'auto',
            padding: 16,
          }}
          onScroll={handleScroll}
        >
          {messages.length === 0 && !busy ? (
            <EmptyState />
          ) : (
            messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                startedAt={
                  message.role === 'assistant' && index === messages.length - 1
                    ? (requestStartedAtRef.current ?? undefined)
                    : undefined
                }
              />
            ))
          )}
          {waitingFirstToken && (
            <Text className="pi-thinking" type="secondary">
              💭 模型思考中…
            </Text>
          )}
        </div>

        <BackBottom visible={!atBottom} onClick={() => scrollToBottom(true)} />
      </div>

      {error && (
        <div
          style={{
            alignItems: 'center',
            background: 'var(--ant-color-error-bg, rgba(255, 77, 79, 0.12))',
            borderRadius: 8,
            color: 'var(--ant-color-error, #ff4d4f)',
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
              <Button size="small" onClick={handleRetry}>
                重试
              </Button>
            )}
            <Button size="small" onClick={clearError}>
              知道了
            </Button>
          </span>
        </div>
      )}

      <ChatComposer busy={busy} onSend={handleSend} onStop={stop} />
    </div>
  );
}
