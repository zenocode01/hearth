import { useEffect, useState } from 'react';

/** GET /api/cli-runs 的返回项：某个会话里等待回答的提问 */
export interface PendingRun {
  input?: unknown;
  method?: string;
  requestId: string;
  runId: string;
  topicId: string | null;
}

/**
 * 轮询「所有会话里等待回答的提问」（每 3s；回到前台立刻刷一次）。
 * 用服务端注册表而不是消息标记：标记只活在流内存里，切走/刷新后消息里就没了。
 */
export function usePendingRuns(): PendingRun[] {
  const [pending, setPending] = useState<PendingRun[]>([]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch('/api/cli-runs', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { pending?: PendingRun[] };
        if (alive) setPending(data.pending ?? []);
      } catch {
        // 网络抖动：忽略，下一轮再试
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return pending;
}
