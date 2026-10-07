'use client';

import 'antd/dist/reset.css';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';

import { ThemeSwitcher } from './ThemeSwitcher';
import { THEME_COOKIE, THEME_TRANSITION_EASE, THEME_TRANSITION_MS, type ThemeMode } from './theme';

type Appearance = 'dark' | 'light';

const DARK_QUERY = '(prefers-color-scheme: dark)';

interface DocumentWithViewTransition {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 临时注入全局样式，返回移除函数并附带兜底清理。 */
function withTemporaryStyle(css: string, ttlMs: number): () => void {
  const style = document.createElement('style');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
  void document.body.offsetHeight; // 强制重排，让样式在本轮提交前生效
  const timer = setTimeout(() => style.remove(), ttlMs);
  return () => {
    clearTimeout(timer);
    style.remove();
  };
}

/**
 * 主题切换动画。
 * 首选 View Transitions：浏览器对整页做快照交叉淡入，天然统一，不受逐元素属性差异影响，
 * 还能把 antd-style 重新生成样式的耗时挡在动画之后。
 * 不支持时退化为"统一颜色过渡"，避免 body 瞬切、组件 0.2s 渐变的错位闪烁。
 */
function runThemeTransition(update: () => void): void {
  if (typeof document === 'undefined') {
    update();
    return;
  }
  if (prefersReducedMotion()) {
    update();
    return;
  }

  const doc = document as unknown as DocumentWithViewTransition;
  if (typeof doc.startViewTransition === 'function') {
    // 真实 DOM 瞬时切换（禁掉逐元素过渡），动画交给快照交叉淡入
    const removeNoTransition = withTemporaryStyle(
      '*,*::before,*::after{transition:none!important}',
      THEME_TRANSITION_MS + 250,
    );
    try {
      const transition = doc.startViewTransition(() => {
        flushSync(update);
      });
      transition.finished.finally(removeNoTransition);
    } catch {
      removeNoTransition();
      update();
    }
    return;
  }

  // 降级方案：给所有元素统一叠加颜色过渡（含 body，避免与组件渐变不同步）
  withTemporaryStyle(
    `*,*::before,*::after{transition:background-color ${THEME_TRANSITION_MS}ms ${THEME_TRANSITION_EASE},` +
      `color ${THEME_TRANSITION_MS}ms ${THEME_TRANSITION_EASE},` +
      `border-color ${THEME_TRANSITION_MS}ms ${THEME_TRANSITION_EASE}!important}`,
    THEME_TRANSITION_MS + 250,
  );
  update();
}

/** 首屏/系统解析用：瞬时切换，不做动画，避免加载时闪现。 */
function applyInstantly(update: () => void): void {
  if (typeof document === 'undefined') {
    update();
    return;
  }
  withTemporaryStyle('*,*::before,*::after{transition:none!important}', 400);
  update();
}

function writeModeCookie(mode: ThemeMode): void {
  try {
    document.cookie = `${THEME_COOKIE}=${mode};path=/;max-age=31536000;SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

interface AppThemeProviderProps extends PropsWithChildren {
  /**
   * 服务端从 cookie 读到的初始模式。
   * 由服务端传入可保证 SSR 与首次客户端渲染一致：既不水合错配，也不首屏闪白。
   */
  initialMode?: ThemeMode;
}

/** 主题装配层（参考 refs/lobe-chat 的 AppTheme，简化版）。 */
export function AppThemeProvider({ children, initialMode = 'auto' }: AppThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  // 初始与 SSR 一致（false）；系统偏好只在挂载后解析，避免水合错配。
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    if (mql.matches) applyInstantly(() => setSystemDark(true));
    const onChange = () => runThemeTransition(() => setSystemDark(mql.matches));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const appearance: Appearance = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;

  // 把解析后的主题写到 <html>，供 globals.css 兜底底色；并同步 color-scheme
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    document.documentElement.style.colorScheme = appearance;
  }, [appearance]);

  const handleModeChange = useCallback((next: ThemeMode) => {
    runThemeTransition(() => setMode(next));
    writeModeCookie(next);
  }, []);

  return (
    <ConfigProvider motion={m}>
      <ThemeProvider
        appearance={appearance}
        defaultAppearance={appearance}
        defaultThemeMode={appearance}
        theme={{ cssVar: { key: 'pi-vars' } }}
      >
        {children}
        <ThemeSwitcher mode={mode} onChange={handleModeChange} />
      </ThemeProvider>
    </ConfigProvider>
  );
}
