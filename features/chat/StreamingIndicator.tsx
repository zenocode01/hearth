'use client';

import { Spin } from '@lobehub/ui/base-ui';
import { memo, useEffect, useState } from 'react';

interface StreamingIndicatorProps {
  /** 操作文案（"正在思考" / "正在调用工具"…） */
  label?: string;
  /** 发起时间戳，用来算已用秒数 */
  startedAt?: number;
}

/**
 * 流式等待指示（对标 LobeHub 的 ContentLoading）：
 * 转圈 + 操作感知文案 + 已用秒数（超过 2 秒才显示秒数，避免闪一下）。
 */
export const StreamingIndicator = memo(({ startedAt, label = '正在思考' }: StreamingIndicatorProps) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setElapsedMs(Date.now() - startedAt);
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const seconds = elapsedMs / 1000;

  return (
    <span
      className="hearth-thinking"
      style={{
        alignItems: 'center',
        color: 'var(--ant-color-text-secondary, rgba(0, 0, 0, 0.45))',
        display: 'inline-flex',
        gap: 6,
      }}
    >
      <Spin size="small" />
      <span style={{ fontSize: 13 }}>
        {label}…{seconds >= 2 ? ` ${seconds.toFixed(1)} 秒` : ''}
      </span>
    </span>
  );
});

StreamingIndicator.displayName = 'StreamingIndicator';
