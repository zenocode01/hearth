'use client';

import { Button, Input, Text } from '@lobehub/ui';
import { memo, useState } from 'react';

interface QuestionOption {
  description?: string;
  label: string;
}

interface QuestionFormProps {
  /** 工具调用参数（pi 的 question 扩展：{ question, options: [{label, description}] }） */
  input?: unknown;
  requestId: string;
  runId: string;
}

function readOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return { label: item };
      const option = item as { description?: unknown; label?: unknown };
      return {
        description: typeof option?.description === 'string' ? option.description : undefined,
        label: typeof option?.label === 'string' ? option.label : '',
      };
    })
    .filter((option) => option.label);
}

/**
 * pi（RPC 模式）的提问表单（参考 refs 的 AskUserQuestionView，简化版）：
 * 选项按钮 + 自定义输入 + 取消；提交后答案送回等待中的进程，原对话继续（不新开一轮）。
 */
export const QuestionForm = memo(({ input, requestId, runId }: QuestionFormProps) => {
  const question = (input as { question?: unknown })?.question;
  const options = readOptions((input as { options?: unknown })?.options);

  const [freeText, setFreeText] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const submit = async (payload: { cancelled?: boolean; value?: string }) => {
    if (sending || submitted) return;
    setSending(true);
    try {
      await fetch(`/api/cli-runs/${runId}/answer`, {
        body: JSON.stringify({ requestId, ...payload }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      setSubmitted(payload.cancelled ? '（已取消）' : (payload.value ?? ''));
    } catch {
      setSubmitted('（提交失败）');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0' }}>
      <Text style={{ fontSize: 13, fontWeight: 500 }}>
        {typeof question === 'string' && question ? question : '需要你的选择'}
      </Text>

      {options.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((option) => (
            <button
              key={option.label}
              disabled={sending || Boolean(submitted)}
              type="button"
              onClick={() => void submit({ value: option.label })}
              style={{
                background: 'var(--ant-color-fill-tertiary, rgba(0, 0, 0, 0.04))',
                border: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.08))',
                borderRadius: 8,
                color: 'inherit',
                cursor: submitted ? 'default' : 'pointer',
                opacity: sending || submitted ? 0.6 : 1,
                padding: '8px 10px',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 12.5 }}>{option.label}</div>
              {option.description && (
                <div style={{ fontSize: 11.5, opacity: 0.55 }}>{option.description}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {submitted ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>已提交：{submitted} —— 等待 pi 继续…</div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <Input
            placeholder="或直接输入答案…"
            size="small"
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
            onPressEnter={() => freeText.trim() && void submit({ value: freeText.trim() })}
          />
          <Button
            disabled={!freeText.trim()}
            loading={sending}
            size="small"
            type="primary"
            onClick={() => void submit({ value: freeText.trim() })}
          >
            提交
          </Button>
          <Button size="small" onClick={() => void submit({ cancelled: true })}>
            取消
          </Button>
        </div>
      )}
    </div>
  );
});

QuestionForm.displayName = 'QuestionForm';
