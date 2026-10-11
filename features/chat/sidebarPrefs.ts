'use client';

/**
 * 侧栏会话列表的视图 / 排序偏好（对标 LIMS 侧栏「列表设置」菜单）。
 *
 * 这是**用户级**偏好，不是会话级：不进数据库，跟主题动画偏好一样存 localStorage。
 * 首帧给默认值（整个应用壳是客户端渲染，见 components/AppThemeRoot，无水合问题）。
 */
export type SidebarView = 'agent' | 'flat';
/**
 * `activity` = 最近活动优先；`created` = 创建时间早的在前。
 *
 * 注意：**不要**再叫 `manual`——没有拖拽就没有"手动"，之前那个名字是个给不了兑现的承诺
 * （UI 上写着"手动排序"，实际只是按 createdAt 升序）。真要做手动排序得先加 `sort_order`
 * 列 + 拖拽，那时再加第三种取值。
 */
export type SidebarSort = 'activity' | 'created';

export const SIDEBAR_VIEW_KEY = 'hearth-sidebar-view';
export const SIDEBAR_SORT_KEY = 'hearth-sidebar-sort';

/** 读一个字符串偏好；值不在候选里（手改过 / 以后加了新选项）就回默认 */
export function readPref<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key) as T | null;
    return stored && values.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式存不下：偏好只影响这次的显示，下次回来用默认值 */
  }
}
