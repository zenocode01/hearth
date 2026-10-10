'use client';

import { Markdown } from '@lobehub/ui';
import { isToolUIPart, type UIMessage } from 'ai';
import { memo } from 'react';

import { AssistantProcess } from './AssistantProcess';
import { AttachmentPreview } from './AttachmentPreview';
import { MessageActions, type MessageActionKey } from './MessageActions';
import { ReasoningBlock } from './ReasoningBlock';
import { ToolCard } from './ToolCard';

interface MessageItemProps {
  /** 生成中时禁用"重新生成" */
  busy?: boolean;
  /** 是否显示"分支"动作（pi 主题隐藏，改用会话树面板） */
  canBranch?: boolean;
  message: UIMessage;
  /** 消息操作（复制 / 放回输入框 / 重新生成 / 删除） */
  onAction?: (message: UIMessage, key: MessageActionKey) => void;
  /** 发起本次请求的时间戳（只对最后一条 AI 消息有意义） */
  startedAt?: number;
}

/**
 * 渲染一条消息：用户为浅色气泡；AI **按片段顺序**渲染推理块 / 工具卡片 / Markdown 正文
 * （多步工具调用时的交错顺序与真实过程一致）。悬停显示操作栏；颜色用 antd CSS 变量。
 *
 * 有工具调用的一轮会做「过程折叠」（对标 LobeHub 的 ProcessFold）：推理 + 工具 + 中间正文
 * 折成一行「已运行 N 步」，**最后那段正文（最终答案）留在外面**始终可见。
 */
export const MessageItem = memo(
  ({ message, startedAt, busy, canBranch = true, onAction }: MessageItemProps) => {
    const isUser = message.role === 'user';

    const text = message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    const hasText = text.trim().length > 0;
    // 附件（图片）：只存 /uploads 引用，这里渲染缩略图 + 点开大图
    const files = message.parts
      .filter((part) => part.type === 'file')
      .map((part) => ({
        filename: part.filename ?? '图片',
        mediaType: part.mediaType,
        url: part.url,
      }));
    // 历史消息从 metadata 里取已持久化的思考耗时
    const persistedReasoningMs = (message.metadata as { reasoningMs?: number } | undefined)
      ?.reasoningMs;
    // 这一条是不是正在流式的（只有最后一条 AI 消息有 startedAt）
    const streamingThis = Boolean(busy && startedAt != null);

    /** 渲染单个片段（推理 / 正文 / 工具卡）。 */
    const renderPart = (part: UIMessage['parts'][number], index: number) => {
      if (part.type === 'reasoning') {
        return part.text.trim() ? (
          <ReasoningBlock
            durationMs={persistedReasoningMs}
            key={index}
            startedAt={startedAt}
            text={part.text}
            // 正文还没出现时视为"仍在思考"
            thinking={!hasText}
          />
        ) : null;
      }

      if (part.type === 'text') {
        return part.text ? (
          <Markdown animated key={index} variant="chat">
            {part.text}
          </Markdown>
        ) : null;
      }

      if (isToolUIPart(part)) {
        const toolName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);

        // 等待回答的提问：内联不渲染（表单在输入框上方的提问栏里，参考 refs 的 InterventionBar）
        const awaiting = (part as { toolMetadata?: { awaiting?: boolean } }).toolMetadata?.awaiting;
        if (awaiting && part.state === 'input-available') return null;

        return (
          <ToolCard
            errorText={part.errorText}
            input={part.input}
            key={part.toolCallId ?? index}
            output={part.output}
            state={part.state}
            toolCallId={part.toolCallId}
            toolMetadata={part.toolMetadata}
            toolName={toolName}
          />
        );
      }

      // step-start 等片段：不渲染（多步边界对用户无意义）
      return null;
    };

    return (
      <div
        className="hearth-msg"
        style={{
          alignItems: isUser ? 'flex-end' : 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {isUser && files.length > 0 && <AttachmentPreview items={files} size={96} />}

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
            (() => {
              const parts = message.parts;
              // 最后一个工具片段的位置：它之前（含）算"过程"，之后算"最终答案"
              let lastTool = -1;
              for (let index = 0; index < parts.length; index += 1) {
                if (isToolUIPart(parts[index])) lastTool = index;
              }
              const hasFinalText = parts
                .slice(lastTool + 1)
                .some((part) => part.type === 'text' && part.text.trim());

              // 没有工具、或工具之后没有正文（整轮就是过程）→ 不折叠，照常全渲染
              if (lastTool < 0 || !hasFinalText) return parts.map(renderPart);

              const processParts = parts.slice(0, lastTool + 1);
              const finalParts = parts.slice(lastTool + 1);
              const steps = parts.filter(isToolUIPart).length;

              return (
                <>
                  <AssistantProcess
                    busy={streamingThis}
                    durationMs={persistedReasoningMs}
                    startedAt={startedAt}
                    steps={steps}
                  >
                    {processParts.map((part, index) => renderPart(part, index))}
                  </AssistantProcess>
                  {finalParts.map((part, index) => renderPart(part, lastTool + 1 + index))}
                </>
              );
            })()
          )}
        </div>

        {onAction && (
          <div className="hearth-msg-actions">
            <MessageActions
              busy={busy}
              canBranch={canBranch}
              role={isUser ? 'user' : 'assistant'}
              onAction={(key) => onAction(message, key)}
            />
          </div>
        )}
      </div>
    );
  },
);

MessageItem.displayName = 'MessageItem';
