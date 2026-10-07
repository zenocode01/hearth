'use client';

import { Flexbox, Icon, Segmented, Text } from '@lobehub/ui';
import { MonitorCog, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ThemeMode } from './theme';
import { useThemeControls } from './themeContext';
import type { ThemeTransitionEffect } from './themeTransition';

const modeOption = (icon: LucideIcon, label: string): ReactNode => (
  <span style={{ alignItems: 'center', display: 'inline-flex', gap: 6 }}>
    <Icon icon={icon} size={14} />
    {label}
  </span>
);

const MODE_OPTIONS: Array<{ label: ReactNode; value: ThemeMode }> = [
  { label: modeOption(MonitorCog, '跟随系统'), value: 'auto' },
  { label: modeOption(Sun, '浅色'), value: 'light' },
  { label: modeOption(Moon, '深色'), value: 'dark' },
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
