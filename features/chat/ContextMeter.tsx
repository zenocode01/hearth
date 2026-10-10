'use client';

import { Block, Flexbox, Icon, Popover, Text } from '@lobehub/ui';
import { Button, toast } from '@lobehub/ui/base-ui';
import { ChevronDown, Gauge } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';

interface SummaryRow {
  compressedCount: number;
  content: string;
  createdAt: string;
  tokenCount: number | null;
}

interface Stats {
  contextWindow: number | null;
  estimatedTokens: number;
  keepRecentTurns: number;
  limit: number;
  messageCount: number;
  /** pi 主题才有：pi 自己算的占用百分比（刚压缩完为 null） */
  percent?: number | null;
  /** 'pi' = 上下文由 pi 管（数字来自 get_session_stats），其余走我们自己的估算 */
  runtime?: string;
  summaryCount: number;
  summaries: SummaryRow[];
  threshold: number;
}

interface ContextMeterProps {
  /** null = 还没建会话（新会话第一条消息之前），不显示 */
  topicId: string | null;
  /** 每次流式回复结束就 +1，让数字跟着刷新 */
  refreshKey?: number;
}

/** 4 位数以下直接显示，以上用 k（chip 空间小，别把操作栏挤爆） */
function formatTokens(value: number | null | undefined): string {
  if (value == null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

/**
 * 上下文占用读数 + 手动压缩入口（工具栏 chip，风格与 ToolPicker / EffortPicker 一致）。
 *
 * 两条链路：
 * - 内置模型：走我们自己的估算与压缩（prepareContext）；
 * - pi 主题：数字来自 pi 的 `get_session_stats`，压缩交回 pi 的 `compact`。
 */
export const ContextMeter = memo(({ topicId, refreshKey = 0 }: ContextMeterProps) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<'error' | 'loading' | 'ready'>('loading');
  const [open, setOpen] = useState(false);
  const [compacting, setCompacting] = useState(false);

  const isPi = stats?.runtime === 'pi';

  const load = useCallback(async () => {
    if (!topicId) {
      setStats(null);
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch(`/api/topics/${topicId}/context`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Stats;
      setStats(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const compact = async () => {
    if (!topicId || compacting) return;
    setCompacting(true);
    try {
      const res = await fetch(`/api/topics/${topicId}/context`, { method: 'POST' });
      const data = (await res.json()) as Stats & {
        compacted?: boolean;
        compressedCount?: number;
        error?: string;
        estimatedTokensAfter?: number;
        reason?: string;
        tokensBefore?: number;
      };
      if (!res.ok) {
        toast.error(data.error ?? '压缩失败，请稍后重试');
      } else if (data.compacted) {
        toast.success(
          data.runtime === 'pi'
            ? `pi 已压缩（${formatTokens(data.tokensBefore)} → ${formatTokens(data.estimatedTokensAfter)} tokens）`
            : `已压缩 ${data.compressedCount ?? 0} 条历史`,
        );
      } else {
        toast.info(data.reason ?? '没有需要压缩的内容');
      }
      setStats(data);
      setStatus('ready');
    } catch {
      toast.error('压缩请求失败，请检查网络或模型配置');
    } finally {
      setCompacting(false);
    }
  };

  /** 撤销最近一次压缩：删掉最新摘要，水位线回退，旧历史下次会重新发给模型。 */
  const undo = async () => {
    if (!topicId || compacting) return;
    setCompacting(true);
    try {
      const res = await fetch(`/api/topics/${topicId}/context`, { method: 'DELETE' });
      const data = (await res.json()) as Stats & { error?: string; reason?: string; removed?: boolean };
      if (!res.ok) {
        toast.error(data.error ?? '撤销失败，请稍后重试');
      } else if (data.removed) {
        toast.success('已撤销最近一次压缩');
      } else {
        toast.info(data.reason ?? '没有可撤销的压缩记录');
      }
      setStats(data);
      setStatus('ready');
    } catch {
      toast.error('撤销请求失败，请检查网络');
    } finally {
      setCompacting(false);
    }
  };

  if (!topicId) return null;

  const denominator = isPi ? (stats?.contextWindow ?? stats?.threshold ?? 0) : (stats?.threshold ?? 0);
  const ratio =
    isPi && stats?.percent != null
      ? stats.percent / 100
      : stats && denominator > 0
        ? stats.estimatedTokens / denominator
        : 0;
  const barColor =
    ratio >= 0.9
      ? 'var(--ant-color-error, #ff4d4f)'
      : ratio >= 0.7
        ? 'var(--ant-color-warning, #faad14)'
        : 'var(--ant-color-primary, #1677ff)';

  return (
    <Popover
      content={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, width: 320 }}>
          <Flexbox align="center" horizontal justify="space-between">
            <Text style={{ fontSize: 13, fontWeight: 600 }}>上下文占用</Text>
            <Text style={{ fontSize: 11.5 }} type="secondary">
              {status === 'ready' && stats
                ? isPi
                  ? `${formatTokens(stats.estimatedTokens)} / ${formatTokens(stats.contextWindow)} tokens`
                  : `${stats.estimatedTokens} / ${stats.threshold} tokens`
                : ''}
            </Text>
          </Flexbox>

          {status === 'loading' && <Text style={{ fontSize: 12 }} type="secondary">统计中…</Text>}
          {status === 'error' && (
            <Flexbox align="center" gap={8} horizontal>
              <Text style={{ fontSize: 12 }} type="secondary">
                统计失败
              </Text>
              <Button onClick={() => void load()} size="small">
                重试
              </Button>
            </Flexbox>
          )}

          {status === 'ready' && stats && (
            <>
              <div
                style={{
                  background: 'var(--ant-color-fill-secondary, rgba(0,0,0,0.06))',
                  borderRadius: 4,
                  height: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: barColor,
                    height: '100%',
                    transition: 'width 200ms ease',
                    width: `${Math.min(100, Math.round(ratio * 100))}%`,
                  }}
                />
              </div>

              {isPi ? (
                <Text style={{ fontSize: 11.5, lineHeight: 1.6 }} type="secondary">
                  这是 pi 自己统计的上下文{stats.percent != null ? `（约 ${Math.round(stats.percent)}%）` : ''}。
                  pi 会在接近上限时自动压缩，也可以点下面手动让它压一次。
                </Text>
              ) : (
                <Text style={{ fontSize: 11.5, lineHeight: 1.6 }} type="secondary">
                  {stats.contextWindow
                    ? `模型窗口 ${formatTokens(stats.contextWindow)}（按 80% 取阈）；`
                    : ''}
                  超过 {stats.threshold} tokens 时自动把旧消息压成摘要，保留最近{' '}
                  {stats.keepRecentTurns} 轮原文。原消息不删，只是不再发给模型。
                </Text>
              )}

              {!isPi && stats.summaryCount > 0 && (
                <div
                  style={{
                    borderTop: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
                    paddingTop: 8,
                  }}
                >
                  <Text style={{ fontSize: 11.5 }} type="secondary">
                    已压缩 {stats.summaryCount} 段（最近一次覆盖 {stats.summaries[0]?.compressedCount ?? 0}{' '}
                    条 · {new Date(stats.summaries[0]?.createdAt ?? Date.now()).toLocaleString()}）
                  </Text>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.6,
                      maxHeight: 160,
                      marginTop: 6,
                      overflowY: 'auto',
                      // 摘要里是模型自己写的条目化文本，别把它当 HTML
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {stats.summaries[0]?.content}
                  </div>
                </div>
              )}
              {!isPi && stats.summaryCount === 0 && (
                <Text style={{ fontSize: 11.5, opacity: 0.55 }} type="secondary">
                  还没压缩过。
                </Text>
              )}

              <Flexbox gap={6} horizontal>
                <Button loading={compacting} onClick={() => void compact()} size="small">
                  立即压缩
                </Button>
                {!isPi && stats.summaryCount > 0 && (
                  <Button
                    disabled={compacting}
                    onClick={() => void undo()}
                    size="small"
                    type="text"
                  >
                    撤销最近一次
                  </Button>
                )}
              </Flexbox>
            </>
          )}
        </div>
      }
      nativeButton={false}
      open={open}
      placement="topLeft"
      styles={{ content: { padding: 0 } }}
      trigger="click"
      onOpenChange={(next) => {
        setOpen(next);
        // 每次打开都重新统计：数字陈旧比没有数字更误导人
        if (next) void load();
      }}
    >
      <Block
        align="center"
        clickable
        gap={6}
        horizontal
        padding={6}
        title="上下文占用与压缩"
        variant="borderless"
      >
        <Icon icon={Gauge} size={16} />
        <Text style={{ fontSize: 12.5 }}>
          {status === 'ready' && stats
            ? `上下文 ${formatTokens(stats.estimatedTokens)}`
            : '上下文 …'}
        </Text>
        <Icon icon={ChevronDown} size={12} style={{ opacity: 0.5 }} />
      </Block>
    </Popover>
  );
});

ContextMeter.displayName = 'ContextMeter';
