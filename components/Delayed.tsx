'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface DelayedProps {
  children: ReactNode;
  /** 等待多久才显示（默认 200ms） */
  delayMs?: number;
}

/**
 * 延迟门控：快响应时骨架屏不出现（避免"闪一下"），慢响应时才显示。
 * 参考 refs 里 LobeHub 的 Skeleton/Delayed 思路。
 */
export function Delayed({ children, delayMs = 200 }: DelayedProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return show ? <>{children}</> : null;
}
