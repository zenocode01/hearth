'use client';

import { confirmModal } from '@lobehub/ui/base-ui';
import type { ReactNode } from 'react';

/**
 * 危险操作确认对话框（删除等）。
 *
 * 对齐 LobeHub 的约定（refs/lobe-chat 的 modal skill）：
 * - 用命令式 `confirmModal` + 全局 `<ModalHost/>`（挂在 AppThemeProvider），不自己画遮罩；
 * - 破坏性操作用 **danger 按钮**，取消在左、确认在右；
 * - 文案写清"删的是什么、能不能恢复"。
 *
 * 为什么要有这个：Hearth 之前删消息**没有二次确认**，删话题/Agent 是行内两步确认——
 * 三者风格不一，且误点代价高。统一走这里。
 */
export interface ConfirmDeleteOptions {
  /** 补充说明（用 `content` 描述影响） */
  content?: ReactNode;
  /** 确认按钮文案，默认「删除」 */
  okText?: string;
  /** 点确认后执行；返回 Promise 时按钮进入 loading */
  onOk: () => Promise<void> | void;
  title: ReactNode;
}

export function confirmDelete({ title, content, okText = '删除', onOk }: ConfirmDeleteOptions) {
  return confirmModal({
    cancelText: '取消',
    content,
    okButtonProps: { danger: true },
    okText,
    onOk,
    title,
  });
}
