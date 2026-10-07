'use client';

import { useEffect, useState } from 'react';

/** 应用壳挂载完成的事件名（由 AppThemeProvider 派发） */
export const APP_READY_EVENT = 'hearth-app-ready';
const READY_FLAG = '__HEARTH_APP_READY__';

/**
 * 首屏启动占位：由 layout 在**服务端**渲染出来，所以 JS 下载 + 水合期间用户也能看到
 * 「正在启动…」而不是白屏（本项目页面是纯客户端渲染，见 AppThemeRoot 的说明）。
 *
 * 应用壳挂载后（AppThemeProvider 派发 hearth-app-ready）隐藏。隐藏走 React state，
 * 不手工操作 DOM —— 避免水合不一致。
 */
export function BootSplash() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 事件可能早于本组件挂载（开发时 Fast Refresh 会重挂），所以用 flag 兜底
    if ((window as Window & { [READY_FLAG]?: boolean })[READY_FLAG]) {
      setReady(true);
      return;
    }
    const markReady = () => setReady(true);
    window.addEventListener(APP_READY_EVENT, markReady);
    return () => window.removeEventListener(APP_READY_EVENT, markReady);
  }, []);

  return (
    <div aria-hidden className="hearth-boot" hidden={ready}>
      <div className="hearth-boot-logo">Hearth</div>
      <div className="hearth-boot-bar" />
      <div className="hearth-boot-text">正在启动…</div>
    </div>
  );
}
