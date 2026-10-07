'use client';

import { createContext, useContext } from 'react';

import type { ThemeMode } from './theme';
import type { ThemeTransitionEffect } from './themeTransition';

export interface ThemeControlValue {
  effect: ThemeTransitionEffect;
  mode: ThemeMode;
  setEffect: (effect: ThemeTransitionEffect) => void;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeControlContext = createContext<ThemeControlValue | null>(null);

/** 读取主题控件状态；页面据此把控件放到合适的位置（顶栏 / 悬浮）。 */
export function useThemeControls(): ThemeControlValue {
  const value = useContext(ThemeControlContext);
  if (!value) throw new Error('useThemeControls 必须在 AppThemeProvider 内使用');
  return value;
}
