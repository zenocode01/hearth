'use client';

import { Block, Icon } from '@lobehub/ui';
import { Spin } from '@lobehub/ui/base-ui';
import { ThinkIcon } from '@lobehub/ui/icons';
import { ChevronDown } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

interface ReasoningBlockProps {
  /** 已持久化的思考耗时（历史消息从库里读出来） */
  durationMs?: number | null;
  /** 发起本次请求的时间戳（实时消息用它算耗时：推理文本往往临近结束才到齐） */
  startedAt?: number;
  text: string;
  /** 仍在思考（正文尚未出现） */
  thinking: boolean;
}

const Chevron = ({ open }: { open: boolean }) => (
  <span
    style={{
      display: 'inline-flex',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s ease',
    }}
  >
    <Icon icon={ChevronDown} size={14} />
  </span>
);

/**
 * 推理过程展示（参考 refs 的 Conversation/components/Thinking）：
 * - 思考中：自动展开，转圈图标 + 呼吸的"思考中…"，内容自动滚到最新；
 * - 思考结束：自动收起成一行"已深度思考 N 秒"；
 * - 点标题任何时候都能完整收缩 / 展开（收起时内容不渲染，高度绝对为 0）。
 */
export const ReasoningBlock = memo(
  ({ text, thinking, startedAt, durationMs }: ReasoningBlockProps) => {
    const [open, setOpen] = useState(thinking);
    const [elapsedMs, setElapsedMs] = useState<number | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    // 思考时展开、结束自动收起（与 LobeHub 行为一致）
    useEffect(() => {
      setOpen(thinking);
    }, [thinking]);

    // 实时消息：思考结束时算出耗时（历史消息直接用持久化的值）
    useEffect(() => {
      if (!thinking && elapsedMs == null && startedAt) {
        setElapsedMs(Math.max(0, Date.now() - startedAt));
      }
    }, [elapsedMs, startedAt, thinking]);

    // 思考中让内容跟着最新一行走
    useEffect(() => {
      const el = bodyRef.current;
      if (el && thinking) el.scrollTop = el.scrollHeight;
    }, [text, thinking]);

    const effectiveMs = durationMs ?? elapsedMs;
    const label = thinking
      ? '思考中…'
      : effectiveMs == null
        ? '思考过程'
        : `已深度思考 ${(effectiveMs / 1000).toFixed(1)} 秒`;

    return (
      <div style={{ marginBottom: open ? 8 : 4 }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            alignItems: 'center',
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            gap: 8,
            padding: '4px 0',
          }}
        >
          <Block
            align="center"
            flex="none"
            height={24}
            horizontal
            justify="center"
            variant="outlined"
            width={24}
          >
            {thinking ? <Spin size="small" /> : <Icon icon={ThinkIcon} />}
          </Block>
          <span
            className={thinking ? 'hearth-thinking' : undefined}
            style={{ fontSize: 12.5, opacity: 0.75 }}
          >
            {label}
          </span>
          <Chevron open={open} />
        </button>

        {/* 折叠：直接挂载/卸载（最可靠，收起时高度绝对为 0），配入场动画 */}
        {open && (
          <div
            className="hearth-scroll hearth-collapse-in"
            ref={bodyRef}
            style={{
              borderLeft: '2px solid var(--ant-color-border, rgba(0, 0, 0, 0.12))',
              color: 'var(--ant-color-text-description, rgba(0, 0, 0, 0.45))',
              fontSize: 12.5,
              lineHeight: 1.7,
              marginTop: 4,
              maxHeight: 'min(40vh, 320px)',
              overflowY: 'auto',
              paddingLeft: 10,
              whiteSpace: 'pre-wrap',
            }}
          >
            {text}
          </div>
        )}
      </div>
    );
  },
);

ReasoningBlock.displayName = 'ReasoningBlock';
