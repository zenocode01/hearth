'use client';

import 'antd/dist/reset.css';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import { ToastHost } from '@lobehub/ui/base-ui';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { ThemeControlContext } from './themeContext';
import { APP_READY_EVENT } from './BootSplash';
import { THEME_COOKIE, type ThemeMode } from './theme';
import {
  applyInstantly,
  readStoredEffect,
  runThemeTransition,
  THEME_EFFECT_STORAGE_KEY,
  type ThemeTransitionEffect,
} from './themeTransition';
type Appearance = 'dark' | 'light';

const DARK_QUERY = '(prefers-color-scheme: dark)';

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
   * 由服务端传入可保证 SSR 与首次客户端渲染一致（本组件不做 SSR，见 AppThemeRoot）。
   */
  initialMode?: ThemeMode;
}

/** 主题装配层（参考 refs/lobe-chat 的 AppTheme，简化版）。 */
export function AppThemeProvider({ children, initialMode = 'auto' }: AppThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  // 本组件不做 SSR（AppThemeRoot 用 dynamic ssr:false），故可安全读 localStorage
  const [effect, setEffect] = useState<ThemeTransitionEffect>(readStoredEffect);
  // 初始与首帧一致（false）；系统偏好只在挂载后解析。
  const [systemDark, setSystemDark] = useState(false);

  const effectRef = useRef(effect);

  // 应用壳挂载完成 → 隐藏首屏启动占位（BootSplash）
  useEffect(() => {
    (window as Window & { __HEARTH_APP_READY__?: boolean }).__HEARTH_APP_READY__ = true;
    window.dispatchEvent(new Event(APP_READY_EVENT));
  }, []);

  // 挂载后解析系统偏好，并监听其变化（系统变化用当前动画效果）
  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    if (mql.matches) applyInstantly(() => setSystemDark(true));
    const onChange = () => runThemeTransition(() => setSystemDark(mql.matches), effectRef.current);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const appearance: Appearance = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;

  // 把解析后的主题写到 <html>，供 globals.css 兜底底色；并同步 color-scheme
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    document.documentElement.style.colorScheme = appearance;
  }, [appearance]);

  const handleModeChange = useCallback(
    (next: ThemeMode) => {
      runThemeTransition(() => setMode(next), effectRef.current);
      writeModeCookie(next);
    },
    [],
  );

  const handleEffectChange = useCallback((next: ThemeTransitionEffect) => {
    effectRef.current = next;
    setEffect(next);
    try {
      localStorage.setItem(THEME_EFFECT_STORAGE_KEY, next);
    } catch {
      /* 隐私模式下忽略 */
    }
  }, []);

  return (
    <ThemeControlContext.Provider
      value={{ effect, mode, setEffect: handleEffectChange, setMode: handleModeChange }}
    >
      <ConfigProvider motion={m}>
        <ThemeProvider
          appearance={appearance}
          defaultAppearance={appearance}
          defaultThemeMode={appearance}
          theme={{ cssVar: { key: 'hearth-vars' } }}
        >
          {children}
          <ToastHost />
        </ThemeProvider>
      </ConfigProvider>
    </ThemeControlContext.Provider>
  );
}
