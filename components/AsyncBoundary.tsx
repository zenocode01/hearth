'use client';

import { Button, Empty } from '@lobehub/ui';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Delayed } from './Delayed';

interface AsyncBoundaryProps {
  children: ReactNode;
  /** 空态节点（配合 isEmpty 使用） */
  empty?: ReactNode;
  /** 请求是否失败（失败时必须可见，不能停在骨架屏上） */
  error?: boolean;
  /** 是否处于空态 */
  isEmpty?: boolean;
  loading: boolean;
  onRetry?: () => void;
  /** 骨架节点；默认延迟 200ms 出现 */
  skeleton?: ReactNode;
}

/**
 * 三态渲染的轻量封装：**错误 → 加载 → 空 → 内容**。
 *
 * 顺序注意：错误优先于骨架，否则请求失败后会永远停在骨架屏上（refs 里的踩坑注释）。
 * 重试时调用方应先把 error 置回 false，这样重试过程中显示的是骨架。
 */
export function AsyncBoundary({
  children,
  empty,
  error = false,
  isEmpty = false,
  loading,
  onRetry,
  skeleton,
}: AsyncBoundaryProps) {
  if (error) {
    return (
      <Empty
        action={
          onRetry ? (
            <Button size="small" type="primary" onClick={onRetry}>
              重试
            </Button>
          ) : undefined
        }
        description="加载失败，请检查网络或服务是否正常"
        icon={AlertTriangle}
        style={{ padding: 32 }}
        title="出错了"
      />
    );
  }

  if (loading) return <Delayed>{skeleton ?? null}</Delayed>;

  if (isEmpty && empty) return <>{empty}</>;

  return <>{children}</>;
}
