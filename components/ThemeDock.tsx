'use client';

import { ThemeControls } from './ThemeControls';

/** 悬浮版主题坞：只给没有顶栏的页面用（首页内容居中，不会遮挡）。外壳样式由胶囊自身提供。 */
export function ThemeDock() {
  return (
    <div
      style={{
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        position: 'fixed',
        right: 16,
        zIndex: 99,
      }}
    >
      <ThemeControls />
    </div>
  );
}
