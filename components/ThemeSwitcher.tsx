'use client';

import { Flexbox, Segmented, Text } from '@lobehub/ui';

import type { ThemeMode } from './theme';
import type { ThemeTransitionEffect } from './themeTransition';

const MODE_OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: '🌗 跟随系统', value: 'auto' },
  { label: '☀️ 浅色', value: 'light' },
  { label: '🌙 深色', value: 'dark' },
];

const EFFECT_OPTIONS: Array<{ label: string; value: ThemeTransitionEffect }> = [
  { label: '淡入', value: 'fade' },
  { label: '圆形', value: 'circle' },
  { label: '无', value: 'none' },
];

interface ThemeSwitcherProps {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
  effect: ThemeTransitionEffect;
  onEffectChange: (effect: ThemeTransitionEffect) => void;
}

/** 右上角固定的主题坞：模式切换 + 切换动画设置。 */
export function ThemeSwitcher({
  mode,
  onModeChange,
  effect,
  onEffectChange,
}: ThemeSwitcherProps) {
  return (
    <Flexbox
      align="flex-end"
      gap={8}
      style={{
        backdropFilter: 'blur(8px)',
        background: 'var(--pi-vars-colorBgElevated, rgba(255, 255, 255, 0.85))',
        border: '1px solid var(--pi-vars-colorBorderSecondary, rgba(0, 0, 0, 0.08))',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        padding: 8,
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 99,
      }}
    >
      <Segmented
        block={false}
        options={MODE_OPTIONS}
        value={mode}
        onChange={(value) => onModeChange(value as ThemeMode)}
      />
      <Flexbox align="center" gap={6} horizontal>
        <Text style={{ fontSize: 12 }} type="secondary">
          切换动画
        </Text>
        <Segmented
          size="small"
          options={EFFECT_OPTIONS}
          value={effect}
          onChange={(value) => onEffectChange(value as ThemeTransitionEffect)}
        />
      </Flexbox>
    </Flexbox>
  );
}
