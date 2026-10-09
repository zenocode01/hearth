'use client';

import { Button, Icon, Popover, Text } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { ChevronRight, MessageCircleQuestion } from 'lucide-react';
import { memo, useState } from 'react';

import type { Topic } from '@/lib/db/schema';

import { questionText } from './interventions';
import type { PendingRun } from './usePendingRuns';

interface PendingIslandProps {
  /** 点一行跳到对应会话去回答 */
  onSelect: (topicId: string) => void;
  /** **其它**会话里等待回答的提问（当前会话的走 QuestionBar） */
  pendings: PendingRun[];
  topics: Topic[];
}

/**
 * 跨会话提示条（参考 LobeHub InterventionBar 的"跨会话 island"，简化版）：
 * 其它会话有等待回答的提问时出现在输入框上方；点「查看」列出各行（会话名 + 问题预览），
 * 点行跳过去回答——这就是"多 pending 的切换"（同会话内 pi 串行提问，tab 在 QuestionBar）。
 * 全部是 confirm 型提问时给「全部同意」按钮（LobeHub 批量批准的对应物；
 * select/input 需要具体选项，只能逐个跳过去答，不做批量）。
 */
export const PendingIsland = memo(({ pendings, topics, onSelect }: PendingIslandProps) => {
  const [open, setOpen] = useState(false);
  const [batching, setBatching] = useState(false);

  if (pendings.length === 0) return null;

  const titleOf = (topicId: string | null) =>
    topics.find((topic) => topic.id === topicId)?.title ?? '未知会话';
  const allConfirm = pendings.every((item) => item.method === 'confirm');

  /** 批量同意：逐个 POST 答案（单条失败不阻塞其它） */
  const approveAll = async () => {
    setBatching(true);
    let ok = 0;
    await Promise.all(
      pendings.map(async (item) => {
        try {
          const res = await fetch(`/api/cli-runs/${item.runId}/answer`, {
            body: JSON.stringify({ requestId: item.requestId, value: true }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          });
          if (res.ok) ok += 1;
        } catch {
          // 网络失败：计入未成功数
        }
      }),
    );
    setBatching(false);
    setOpen(false);
    if (ok === pendings.length) toast.success(`已同意 ${ok} 个提问`);
    else toast.error(`已同意 ${ok}/${pendings.length} 个，其余请进会话回答`);
  };

  return (
    <div style={{ padding: '0 12px 6px' }}>
      <div
        style={{
          alignItems: 'center',
          background: 'var(--ant-color-warning-bg, rgba(250, 173, 20, 0.10))',
          border: '1px solid var(--ant-color-warning-border, rgba(250, 173, 20, 0.35))',
          borderRadius: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 10px',
        }}
      >
        <Icon icon={MessageCircleQuestion} size={14} />
        <Text style={{ flex: 1, fontSize: 12.5, fontWeight: 600, minWidth: 140 }}>
          另有 {pendings.length} 个会话在等待回答
        </Text>
        {allConfirm && (
          <Button loading={batching} size="small" type="primary" onClick={() => void approveAll()}>
            全部同意
          </Button>
        )}
        <Popover
          content={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 6, width: 300 }}>
              {pendings.map((item) => (
                <button
                  key={`${item.runId}:${item.requestId}`}
                  onClick={() => {
                    setOpen(false);
                    if (item.topicId) onSelect(item.topicId);
                  }}
                  style={{
                    alignItems: 'stretch',
                    background: 'var(--ant-color-fill-tertiary, rgba(0, 0, 0, 0.04))',
                    border: 'none',
                    borderRadius: 8,
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '8px 10px',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  type="button"
                >
                  <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
                    <Text
                      ellipsis
                      style={{ flex: 1, fontSize: 12.5, fontWeight: 600, minWidth: 0 }}
                    >
                      {titleOf(item.topicId)}
                    </Text>
                    <Icon icon={ChevronRight} size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                  </div>
                  <div
                    style={{
                      display: '-webkit-box',
                      fontSize: 11.5,
                      opacity: 0.65,
                      overflow: 'hidden',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                    }}
                  >
                    {questionText(item.input)}
                  </div>
                </button>
              ))}
            </div>
          }
          nativeButton
          open={open}
          placement="top"
          styles={{ content: { padding: 0 } }}
          trigger="click"
          onOpenChange={setOpen}
        >
          <Button size="small">查看</Button>
        </Popover>
      </div>
    </div>
  );
});

PendingIsland.displayName = 'PendingIsland';
