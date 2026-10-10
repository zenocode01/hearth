'use client';

import { Button } from '@lobehub/ui';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

/**
 * 危险操作确认（删除）。
 *
 * **完全自绘的遮罩弹层**（纯 fixed + div + @lobehub/ui 的 Button），不依赖任何弹层库/全局挂载点。
 * 踩过的坑：命令式 `confirmModal` 依赖全局 `ModalHost`（宿主没挂上就"点了没反应"）；
 * 这里连 `@lobehub/ui` 的 `<Modal>` 都不用，避免环境差异——和能用的图片灯箱同一套做法。
 *
 * 用法：
 *   const confirm = useConfirmDelete();
 *   <ActionIcon onClick={() => confirm.open({ title: '删除这条消息？', onOk: () => del(id) })} />
 *   ...
 *   {confirm.modal}
 */
export interface ConfirmDeleteOptions {
  content?: ReactNode;
  okText?: string;
  onOk: () => Promise<void> | void;
  title: ReactNode;
}

export function useConfirmDelete() {
  const [pending, setPending] = useState<ConfirmDeleteOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((options: ConfirmDeleteOptions) => setPending(options), []);
  const close = useCallback(() => setPending(null), []);

  // Esc 关闭
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const handleOk = useCallback(async () => {
    if (!pending) return;
    try {
      setLoading(true);
      await pending.onOk();
    } finally {
      setLoading(false);
      setPending(null);
    }
  }, [pending]);

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
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{pending.title}</div>
        {pending.content && (
          <div
            style={{
              color: 'var(--ant-color-text-secondary, rgba(0,0,0,0.65))',
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            {pending.content}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button size="small" onClick={close}>
            取消
          </Button>
          <Button danger loading={loading} size="small" type="primary" onClick={() => void handleOk()}>
            {pending.okText ?? '删除'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { modal, open };
}
