'use client';

import { Button, Input } from '@lobehub/ui';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

/**
 * 输入对话框（重命名等）。和 `useConfirmDelete` 同一套**自绘遮罩**（不依赖弹层库/全局挂载点）。
 *
 * 用法：
 *   const rename = usePromptDialog();
 *   rename.open({ title: '重命名会话', defaultValue: title, onSubmit: (v) => save(v) });
 *   ...
 *   {rename.modal}
 */
export interface PromptDialogOptions {
  defaultValue?: string;
  okText?: string;
  onSubmit: (value: string) => Promise<void> | void;
  placeholder?: string;
  title: ReactNode;
}

export function usePromptDialog() {
  const [pending, setPending] = useState<PromptDialogOptions | null>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const open = useCallback((options: PromptDialogOptions) => {
    setPending(options);
    setValue(options.defaultValue ?? '');
  }, []);
  const close = useCallback(() => setPending(null), []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const submit = useCallback(async () => {
    if (!pending || !value.trim()) return;
    try {
      setLoading(true);
      await pending.onSubmit(value.trim());
    } finally {
      setLoading(false);
      setPending(null);
    }
  }, [pending, value]);

  const modal = pending ? (
    <div
      onClick={close}
      style={{
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        inset: 0,
        justifyContent: 'center',
        position: 'fixed',
        zIndex: 1200,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--ant-color-bg-elevated, #fff)',
          border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
          borderRadius: 12,
          boxShadow: '0 20px 20px -8px rgba(0, 0, 0, 0.24)',
          padding: 20,
          width: 'min(90vw, 380px)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{pending.title}</div>
        <Input
          autoFocus
          placeholder={pending.placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={() => void submit()}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button size="small" onClick={close}>
            取消
          </Button>
          <Button
            disabled={!value.trim()}
            loading={loading}
            size="small"
            type="primary"
            onClick={() => void submit()}
          >
            {pending.okText ?? '保存'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { modal, open };
}
