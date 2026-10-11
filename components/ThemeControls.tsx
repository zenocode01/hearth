'use client';

import { Block, Flexbox, Icon, Popover, Segmented, Text } from '@lobehub/ui';
import { ChevronDown, MonitorCog, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { ThemeMode } from './theme';
import { useThemeControls } from './themeContext';
import type { ThemeTransitionEffect } from './themeTransition';
import { useIsMobile } from './useMediaQuery';

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

const MODE_ICON: Record<ThemeMode, LucideIcon> = {
  auto: MonitorCog,
  dark: Moon,
  light: Sun,
};

const MODE_LABEL: Record<ThemeMode, string> = {
  auto: '跟随系统',
  dark: '深色',
  light: '浅色',
};

/** 展开后的两组选项（桌面内联展开与移动端浮层共用） */
function OptionsPanel() {
  const { effect, mode, setEffect, setMode } = useThemeControls();

  return (
    <Flexbox align="center" gap={10} horizontal style={{ whiteSpace: 'nowrap' }}>
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

/**
 * 桌面：胶囊按钮，折叠态只露当前模式的图标 + 名字，点一下原地展开成两组分段控件。
 * 收起方式：再点触发器 / 点胶囊外 / Esc（收起后焦点回到触发器）。
 * 宽度动画在 globals.css（.hearth-theme-pill-*），用 animation 不用 transition。
 */
function ThemeControlsPill() {
  const { mode } = useThemeControls();
  // 首帧不定状态（不写 data-open）：否则挂载时会播放一次收起动画，胶囊看起来“缩”一下
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const pillRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const CurrentIcon = MODE_ICON[mode];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!pillRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      aria-label="外观设置"
      className="hearth-theme-pill"
      data-open={open === undefined ? undefined : String(open)}
      ref={pillRef}
    >
      <button
        aria-controls="hearth-theme-options"
        aria-expanded={open === true}
        className="hearth-theme-pill-trigger"
        ref={triggerRef}
        title="外观设置"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon={CurrentIcon} size={16} />
        <span className="hearth-theme-pill-label">{MODE_LABEL[mode]}</span>
        <span aria-hidden="true" className="hearth-theme-pill-caret">
          <Icon icon={ChevronDown} size={14} />
        </span>
      </button>

      <div className="hearth-theme-pill-body" id="hearth-theme-options">
        <div className="hearth-theme-pill-inner" inert={open !== true}>
          <OptionsPanel />
        </div>
      </div>
    </div>
  );
}

/**
 * 移动端：顶栏放不下展开后的胶囊，仍用浮层（渐进披露）。
 * 触发器不能用 <button>（base-ui 要求 nativeButton={false}）。
 */
function ThemeControlsCompact() {
  const { mode } = useThemeControls();
  const [open, setOpen] = useState(false);
  const CurrentIcon = MODE_ICON[mode];

  return (
    <Popover
      content={<div style={{ padding: 10 }}><OptionsPanel /></div>}
      nativeButton={false}
      open={open}
      placement="bottomRight"
      styles={{ content: { padding: 0 } }}
      trigger="click"
      onOpenChange={setOpen}
    >
      <Block align="center" clickable gap={6} horizontal padding={8} title="外观设置" variant="borderless">
        <Icon icon={CurrentIcon} size={16} />
        <span style={{ fontSize: 12 }}>{MODE_LABEL[mode]}</span>
      </Block>
    </Popover>
  );
}

/** 主题控件本体（不定位）：放到顶栏或悬浮坞里由页面决定；窄屏自动收起。 */
export function ThemeControls() {
  const isMobile = useIsMobile();
  return isMobile ? <ThemeControlsCompact /> : <ThemeControlsPill />;
}
