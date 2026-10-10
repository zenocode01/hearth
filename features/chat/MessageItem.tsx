'use client';

import { Button, Markdown, TextArea } from '@lobehub/ui';
import { isToolUIPart, type UIMessage } from 'ai';
import { memo, useEffect, useRef, useState } from 'react';

import { AgentAvatar } from '@/features/agent/AgentAvatar';

import { AssistantProcess } from './AssistantProcess';
import { AttachmentPreview } from './AttachmentPreview';
import { useMessageAction } from './MessageActionProvider';
import type { MessageActionKey } from './MessageActions';
import { ReasoningBlock } from './ReasoningBlock';
import { ToolCard } from './ToolCard';

interface MessageItemProps {
  /** 助手头像（emoji 或 `icon:<key>`） */
  assistantAvatar?: string | null;
  /** 头像底色 */
  assistantBackground?: string | null;
  /** 助手名字 */
  assistantName?: string;
  /** 生成中时禁用"重新生成" */
  busy?: boolean;
  /** 是否显示"分支"动作（pi 主题隐藏，改用会话树面板） */
  canBranch?: boolean;
  /** 是否显示"编辑"动作（pi 主题隐藏） */
  canEdit?: boolean;
  /** 是否处于编辑态（用户消息） */
  editing?: boolean;
  message: UIMessage;
  /** 消息操作（复制 / 放回输入框 / 重新生成 / 删除） */
  onAction?: (message: UIMessage, key: MessageActionKey) => void;
  /** 取消编辑 */
  onEditCancel?: () => void;
  /** 提交编辑（id + 新文本） */
  onEditSubmit?: (id: string, text: string) => void;
  /** 发起本次请求的时间戳（只对最后一条 AI 消息有意义） */
  startedAt?: number;
}

/** 相对时间（对标 LobeHub 消息头的相对时间）。 */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 渲染一条消息：用户为浅色气泡；助手带**头像 + 名字 + 相对时间**（对标 LobeHub 的 ChatItem），
 * AI 正文按片段顺序渲染推理块 / 工具卡片 / Markdown（多步工具调用的交错顺序与真实过程一致）。
 *
 * 有工具调用的一轮做「过程折叠」（对标 LobeHub 的 ProcessFold）：推理 + 工具 + 中间正文
 * 折成一行「已运行 N 步」，最后那段正文（最终答案）留在外面始终可见。
 */
export const MessageItem = memo(
  ({
    message,
    startedAt,
    busy,
    assistantAvatar,
    assistantBackground,
    assistantName,
    canBranch = true,
    canEdit = true,
    editing,
    onAction,
    onEditCancel,
    onEditSubmit,
  }: MessageItemProps) => {
    const isUser = message.role === 'user';
    const holderRef = useRef<HTMLDivElement>(null);
    const actionCtx = useMessageAction();
    /** 离开宽限期：鼠标离开后延迟收起，避免"刚离开就消失" */
    const hideTimer = useRef<number | null>(null);
    const [editDraft, setEditDraft] = useState('');

    useEffect(
      () => () => {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
      },
      [],
    );

    // 进入编辑态时把当前文本填进编辑器
    useEffect(() => {
      if (editing) {
        const current = message.parts
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('');
        setEditDraft(current);
      }
    }, [editing]);

    const text = message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    const hasText = text.trim().length > 0;
    const files = message.parts
      .filter((part) => part.type === 'file')
      .map((part) => ({
        filename: part.filename ?? '图片',
        mediaType: part.mediaType,
        url: part.url,
      }));
    const meta = message.metadata as { createdAt?: number; reasoningMs?: number } | undefined;
    const persistedReasoningMs = meta?.reasoningMs;
    const streamingThis = Boolean(busy && startedAt != null);

    // 时间：历史消息用 createdAt；最后一条 AI 消息退回请求发起时间
    const ts = meta?.createdAt ?? (!isUser ? startedAt : undefined);
    const timeLabel = ts ? formatRelativeTime(ts) : null;

    /** 渲染单个片段（推理 / 正文 / 工具卡）。 */
    const renderPart = (part: UIMessage['parts'][number], index: number) => {
      if (part.type === 'reasoning') {
        return part.text.trim() ? (
          <ReasoningBlock
            durationMs={persistedReasoningMs}
            key={index}
            startedAt={startedAt}
            text={part.text}
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

      return null;
    };

    /** AI 正文（含过程折叠）。 */
    const assistantBody = (() => {
      const parts = message.parts;
      // 末尾连续的正文块 = 最终答案；其余（推理 / 工具 / 中间正文）= 过程
      let finalStart = parts.length;
      for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (part.type === 'text' && part.text.trim()) finalStart = index;
        else break;
      }
      const processParts = parts.slice(0, finalStart);
      const finalParts = parts.slice(finalStart);
      const steps = processParts.filter(isToolUIPart).length;
      // 没有工具就不折（推理块自己会收起）；没有最终答案也不折（别把整轮藏起来）
      if (steps === 0 || finalParts.length === 0) return parts.map(renderPart);

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
          {finalParts.map((part, index) => renderPart(part, finalStart + index))}
        </>
      );
    })();

    return (
      <div
        className="hearth-msg"
        data-role={isUser ? 'user' : 'assistant'}
        style={{
          alignItems: isUser ? 'flex-end' : 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
        onMouseEnter={() => {
          // 把单例动作栏"搬"到这条消息的占位里（对标 LobeHub 的 MessageActionProvider）
          if (!onAction || !holderRef.current) return;
          if (hideTimer.current) {
            window.clearTimeout(hideTimer.current);
            hideTimer.current = null;
          }
          actionCtx?.setActive({
            busy,
            canBranch,
            canEdit,
            element: holderRef.current,
            id: message.id,
            onAction: (key) => onAction(message, key),
            role: isUser ? 'user' : 'assistant',
          });
        }}
        onMouseLeave={() => {
          if (hideTimer.current) window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => {
            hideTimer.current = null;
            actionCtx?.clearIf(message.id);
          }, 200);
        }}
      >
        {isUser ? (
          <>
            {files.length > 0 && <AttachmentPreview items={files} size={96} />}
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '85%', width: '100%' }}>
                <TextArea
                  autoFocus
                  autoSize={{ maxRows: 8, minRows: 1 }}
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={onEditCancel}>
                    取消
                  </Button>
                  <Button
                    disabled={!editDraft.trim()}
                    size="small"
                    type="primary"
                    onClick={() => onEditSubmit?.(message.id, editDraft)}
                  >
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'var(--ant-color-fill-secondary, rgba(0, 0, 0, 0.06))',
                  borderRadius: 12,
                  maxWidth: '85%',
                  padding: '10px 14px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                <span>{text}</span>
              </div>
            )}
          </>
        ) : (
          <div style={{ alignItems: 'flex-start', display: 'flex', gap: 8, maxWidth: '85%' }}>
            <AgentAvatar
              avatar={assistantAvatar}
              background={assistantBackground}
              size={28}
            />
            <div
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                gap: 2,
                minWidth: 0,
                paddingTop: 2,
                wordBreak: 'break-word',
              }}
            >
              <div style={{ alignItems: 'baseline', display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {assistantName ?? '助手'}
                </span>
                {timeLabel && (
                  <span style={{ color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))', fontSize: 12 }}>
                    {timeLabel}
                  </span>
                )}
              </div>
              {assistantBody}
            </div>
          </div>
        )}

        {onAction && (
          <div
            className="hearth-msg-actions"
            ref={holderRef}
            style={{ paddingLeft: isUser ? 0 : 36 }}
          />
        )}
      </div>
    );
  },
);

MessageItem.displayName = 'MessageItem';
