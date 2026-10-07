'use client';

import { Markdown } from '@lobehub/ui';
import type { UIMessage } from 'ai';
import { memo, useEffect, useRef } from 'react';

interface MessageItemProps {
  message: UIMessage;
}

/** 推理模型的"思考过程"：正文出现前展开显示，出现后作为可回看的弱化区块。 */
const ReasoningBlock = memo(({ thinking, text }: { thinking: boolean; text: string }) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  // 思考阶段持续滚到最新一行
  useEffect(() => {
    const el = bodyRef.current;
    if (el && thinking) el.scrollTop = el.scrollHeight;
  }, [text, thinking]);

  return (
    <div style={{ marginBottom: thinking ? 0 : 10 }}>
      <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.6 }}>
        {thinking ? '💭 思考中…' : '💭 思考过程'}
      </div>
      <div
        className="pi-scroll"
        ref={bodyRef}
        style={{
          borderLeft: '2px solid var(--ant-color-border, rgba(0, 0, 0, 0.12))',
          fontSize: 12.5,
          lineHeight: 1.7,
          maxHeight: 200,
          opacity: 0.7,
          overflowY: 'auto',
          paddingLeft: 10,
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
    </div>
  );
});

ReasoningBlock.displayName = 'ReasoningBlock';

/**
 * 渲染一条消息：用户为浅色气泡；AI 为推理（可选）+ Markdown 正文。
 * 颜色用 antd 的 CSS 变量（--ant-color-*），随深浅色自动切换。
 */
export const MessageItem = memo(({ message }: MessageItemProps) => {
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
            {hasReasoning && <ReasoningBlock text={reasoning} thinking={!hasText} />}
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
