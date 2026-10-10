'use client';

import { Modal } from '@lobehub/ui/base-ui';
import { useCallback, useState, type ReactNode } from 'react';

/**
 * 危险操作确认（删除）。
 *
 * **为什么不用命令式 `confirmModal`**：它依赖全局 `<ModalHost/>`（挂在 AppThemeProvider）。
 * 一旦那个宿主没挂上（例如 dev 的 HMR 只更新了子组件、根壳没重挂），点了删除**既不弹窗也不删**——
 * 表现为"点击没反应"。改成**声明式 `<Modal>` + 局部状态**：对话框就在调用点的 React 树里，
 * 自包含、无全局依赖，怎么都不会"没反应"。
 *
 * 用法：
 *   const confirm = useConfirmDelete();
 *   <ActionIcon onClick={() => confirm.open({ title: '删除会话？', onOk: () => del(id) })} />
 *   ...
 *   {confirm.modal}   // 挂在组件树里任意位置
 */
export interface ConfirmDeleteOptions {
  /** 补充说明（描述影响/是否可恢复） */
  content?: ReactNode;
  /** 确认按钮文案，默认「删除」 */
  okText?: string;
  /** 点确认后执行；返回 Promise 时按钮进入 loading */
  onOk: () => Promise<void> | void;
  title: ReactNode;
}

export function useConfirmDelete() {
  const [pending, setPending] = useState<ConfirmDeleteOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((options: ConfirmDeleteOptions) => setPending(options), []);
  const close = useCallback(() => setPending(null), []);

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

  const modal = (
    <Modal
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ danger: true }}
      okText={pending?.okText ?? '删除'}
      open={pending !== null}
      title={pending?.title}
      onCancel={close}
      onOk={() => void handleOk()}
    >
      {pending?.content}
    </Modal>
  );

  return { modal, open };
}
