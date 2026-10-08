'use client';

import { ThemeControls } from './ThemeControls';

/** 悬浮版主题坞：只给没有顶栏的页面用（首页内容居中，不会遮挡）。 */
export function ThemeDock() {
  return (
    <div
      style={{
        backdropFilter: 'blur(8px)',
        background: 'var(--ant-color-bg-elevated, rgba(255, 255, 255, 0.85))',
        border: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.08))',
        borderRadius: 12,
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
        padding: 8,
        position: 'fixed',
        right: 16,
        zIndex: 99,
      }}
    >
      <ThemeControls />
    </div>
  );
}
