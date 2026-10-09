'use client';

import { Icon, Text } from '@lobehub/ui';
import { MessageCircleQuestion } from 'lucide-react';
import { memo, useState } from 'react';

import { QuestionForm } from './QuestionForm';
import { questionText, type PendingQuestion } from './interventions';

/**
 * 输入框上方的提问栏（参考 refs 的 Conversation/InterventionBar）：
 * 有等待回答的提问时出现，回答在栏里完成；消息里的工具卡片只保留结果，
 * 这样回答入口永远在同一个位置（不用在长对话里找卡片）。
 *
 * 支持多个 pending（tab 切换，对齐 LobeHub 的 tab 栏）：pi 是串行提问，同会话
 * 正常只有 1 个；多于 1 个只出现在双开页面等恢复场景，列表兜底而不是漏答。
 */
export const QuestionBar = memo(({ pendings }: { pendings: PendingQuestion[] }) => {
  const [index, setIndex] = useState(0);
  const activeIndex = Math.min(index, pendings.length - 1);
  const active = pendings[activeIndex];
  if (!active) return null;

  return (
    <div style={{ padding: '0 12px 6px' }}>
      <div
        style={{
          background: 'var(--ant-color-primary-bg, rgba(22, 119, 255, 0.06))',
          border: '1px solid var(--ant-color-primary-border, rgba(22, 119, 255, 0.3))',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 10,
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
          <Icon icon={MessageCircleQuestion} size={14} />
          <Text style={{ fontSize: 12.5, fontWeight: 600 }}>
            需要你的回答{pendings.length > 1 ? `（${pendings.length}）` : ''}
          </Text>
        </div>

        {/* 多个 pending：顶部 tab 切换（对齐 LobeHub 的 tab 切换） */}
        {pendings.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pendings.map((item, itemIndex) => (
              <button
                key={item.requestId}
                onClick={() => setIndex(itemIndex)}
                style={{
                  background:
                    itemIndex === activeIndex
                      ? 'var(--ant-color-primary, #1677ff)'
                      : 'var(--ant-color-fill-tertiary, rgba(0, 0, 0, 0.04))',
                  border: 'none',
                  borderRadius: 7,
                  color: itemIndex === activeIndex ? '#fff' : 'inherit',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  maxWidth: 180,
                  overflow: 'hidden',
                  padding: '3px 9px',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                type="button"
              >
                {questionText(item.input).slice(0, 12)}
              </button>
            ))}
          </div>
        )}

        <QuestionForm
          key={active.requestId}
          input={active.input}
          requestId={active.requestId}
          runId={active.runId}
        />
      </div>
    </div>
  );
});

QuestionBar.displayName = 'QuestionBar';
