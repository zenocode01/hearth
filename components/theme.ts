/** 主题相关的共享常量与类型（服务端/客户端都用）。 */
export const THEME_COOKIE = 'pi-theme';

export type ThemeMode = 'auto' | 'light' | 'dark';

/** 主题切换动画时长与缓动（同时用于 View Transitions 与降级方案）。 */
export const THEME_TRANSITION_MS = 280;
export const THEME_TRANSITION_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
