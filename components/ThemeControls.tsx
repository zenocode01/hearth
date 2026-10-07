'use client';

import { Flexbox, Segmented, Text } from '@lobehub/ui';

import type { ThemeMode } from './theme';
import { useThemeControls } from './themeContext';
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

/** 主题控件本体（不定位）：放到顶栏或悬浮坞里由页面决定。 */
export function ThemeControls() {
  const { effect, mode, setEffect, setMode } = useThemeControls();

  return (
    <Flexbox align="flex-end" gap={8}>
      <Segmented
        block={false}
        options={MODE_OPTIONS}
        value={mode}
        onChange={(value) => setMode(value as ThemeMode)}
      />
      <Flexbox align="center" gap={6} horizontal>
        <Text style={{ fontSize: 12 }} type="secondary">
          切换动画
        </Text>
        <Segmented
          size="small"
          options={EFFECT_OPTIONS}
          value={effect}
          onChange={(value) => setEffect(value as ThemeTransitionEffect)}
        />
      </Flexbox>
    </Flexbox>
  );
}
