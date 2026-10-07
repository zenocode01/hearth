'use client';

import { Segmented } from '@lobehub/ui';

import type { ThemeMode } from './theme';

interface ThemeSwitcherProps {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

const OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: '🌗 跟随系统', value: 'auto' },
  { label: '☀️ 浅色', value: 'light' },
  { label: '🌙 深色', value: 'dark' },
];

/** 右下角固定的主题切换器（阶段 0 验收点：深浅色切换正常）。 */
export function ThemeSwitcher({ mode, onChange }: ThemeSwitcherProps) {
  return (
    <div
      style={{
        bottom: 16,
        position: 'fixed',
        right: 16,
        zIndex: 99,
      }}
    >
      <Segmented
        block={false}
        options={OPTIONS}
        value={mode}
        onChange={(value) => onChange(value as ThemeMode)}
      />
    </div>
  );
}
