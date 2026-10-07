'use client';

import 'antd/dist/reset.css';

import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import * as m from 'motion/react-m';
import { useEffect, useState, type PropsWithChildren } from 'react';

import { ThemeSwitcher, type ThemeMode } from './ThemeSwitcher';

/** 'auto' 解析为系统深浅色；其余值直接生效。 */
function useSystemAppearance(): 'dark' | 'light' {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return dark ? 'dark' : 'light';
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem('pi-theme');
    return stored === 'dark' || stored === 'light' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * 主题装配层（参考 refs/lobe-chat 的 AppTheme + NextThemeProvider，简化版）：
 * ConfigProvider 管 lobe-ui 全局配置；ThemeProvider 管深浅色 token。
 * 主题状态在这里持有，页面只负责展示。
 */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);
  const system = useSystemAppearance();
  const appearance = mode === 'auto' ? system : mode;

  useEffect(() => {
    try {
      localStorage.setItem('pi-theme', mode);
    } catch {
      /* 隐私模式下忽略 */
    }
  }, [mode]);

  return (
    <ConfigProvider motion={m}>
      <ThemeProvider
        appearance={appearance}
        defaultAppearance={appearance}
        defaultThemeMode={appearance}
        theme={{ cssVar: { key: 'pi-vars' } }}
      >
        {children}
        <ThemeSwitcher mode={mode} onChange={setMode} />
      </ThemeProvider>
    </ConfigProvider>
  );
}
