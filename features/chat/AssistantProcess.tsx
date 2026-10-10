'use client';

import { Block, Icon } from '@lobehub/ui';
import { Spin } from '@lobehub/ui/base-ui';
import { ChevronDown, ListChecks } from 'lucide-react';
import { memo, useEffect, useState, type ReactNode } from 'react';

interface AssistantProcessProps {
  /** 过程内容：这一轮的推理 / 工具调用 / 中间正文（最终答案不在这里） */
  children: ReactNode;
  /** 这一轮仍在流式：默认展开 + 转圈 */
  busy?: boolean;
  /** 已持久化的耗时（历史消息用；实时用 startedAt 算） */
  durationMs?: number | null;
  /** 发起时间戳（流式中算实时耗时） */
  startedAt?: number;
  /** 过程步数（工具调用次数） */
  steps: number;
}

/**
 * 助手「过程」折叠条（对标 LobeHub 的 ProcessFold / WorkflowCollapse，简化版）。
 *
 * 一轮里常夹着推理 + 多次工具调用 + 中间说明；全铺开会淹没最终答案。
 * 这里把它们折成一行摘要（默认：流式中展开、结束后收起），**最终答案始终露在外面**。
 */
export const AssistantProcess = memo(
  ({ children, busy, steps, startedAt, durationMs }: AssistantProcessProps) => {
    const [open, setOpen] = useState(Boolean(busy));
    const [elapsedMs, setElapsedMs] = useState<number | null>(null);

    // 流式中展开、结束自动收起（与推理块一致）
    useEffect(() => {
      setOpen(Boolean(busy));
    }, [busy]);

    // 流式中每 0.5s 刷新一次已用时长
    useEffect(() => {
      if (!busy || !startedAt) return;
      setElapsedMs(Date.now() - startedAt);
      const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 500);
      return () => clearInterval(id);
    }, [busy, startedAt]);

    const effectiveMs = busy ? elapsedMs : durationMs;
    const label = `已运行 ${steps} 步${
      effectiveMs != null ? ` · ${(effectiveMs / 1000).toFixed(1)} 秒` : ''
    }`;

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
            {busy ? <Spin size="small" /> : <Icon icon={ListChecks} size={14} />}
          </Block>
          <span
            className={busy ? 'hearth-thinking' : undefined}
            style={{ fontSize: 12.5, opacity: 0.75 }}
          >
            {label}
          </span>
          <span
            style={{
              display: 'inline-flex',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <Icon icon={ChevronDown} size={14} />
          </span>
        </button>

        {open && (
          <div
            className="hearth-scroll hearth-collapse-in"
            style={{
              borderLeft: '2px solid var(--ant-color-border, rgba(0, 0, 0, 0.12))',
              marginTop: 4,
              paddingLeft: 10,
            }}
          >
            {children}
          </div>
        )}
      </div>
    );
  },
);

AssistantProcess.displayName = 'AssistantProcess';
