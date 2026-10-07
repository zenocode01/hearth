/** 主题相关的共享常量与类型（服务端/客户端都用）。 */
export const THEME_COOKIE = 'hearth-theme';

/** 旧项目名（pi-web）时期的 cookie：读取时兼容一次，用户偏好不丢 */
export const LEGACY_THEME_COOKIE = 'pi-theme';

export type ThemeMode = 'auto' | 'light' | 'dark';

/** 主题切换动画时长与缓动（同时用于 View Transitions 与降级方案）。 */
export const THEME_TRANSITION_MS = 280;
export const THEME_TRANSITION_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
