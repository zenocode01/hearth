'use client';

import { Block, Flexbox, Icon, Popover, Text } from '@lobehub/ui';
import { Switch } from '@lobehub/ui/base-ui';
import { Blocks, Calculator, ChevronDown, Clock, Globe, Wrench, type LucideIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';

import type { ToolSetting } from '@/lib/tools/settings';

interface ToolItem {
  description: string;
  label: string;
  name: string;
}

/** 工具图标（按工具名；未知工具用扳手兜底） */
const TOOL_ICONS: Record<string, LucideIcon> = {
  calculate: Calculator,
  fetch_url: Globe,
  get_current_time: Clock,
};

interface ToolPickerProps {
  /** 当前开关（[] 或 null = 全部自动启用） */
  onChange: (settings: ToolSetting[]) => void;
  settings: ToolSetting[] | null;
}

/**
 * 输入框上的「工具」入口（参考 refs 的 ChatInput/ActionBar/Tools）：
 * 点开是 Popover 列表——按启用状态分组，每行一个开关；关掉的工具不会发给模型。
 */
export const ToolPicker = memo(({ settings, onChange }: ToolPickerProps) => {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ToolItem[]>([]);

  // 目录来自服务端（与给模型的定义同一来源，见 lib/llm/tools.ts 的 TOOL_CATALOG）。
  // 失败不置空——打开面板时会再补拉一次（dev 首次编译可能超时）。
  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/tools');
      if (!res.ok) return;
      const data = (await res.json()) as { tools?: ToolItem[] };
      setCatalog(data.tools ?? []);
    } catch {
      /* 打开面板时会重试 */
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next && catalog.length === 0) void loadCatalog();
    },
    [catalog.length, loadCatalog],
  );

  const disabledNames = new Set(
    (settings ?? []).filter((item) => item.mode === 'disabled').map((item) => item.name),
  );
  const enabledCount = catalog.filter((tool) => !disabledNames.has(tool.name)).length;

  const toggle = (name: string, next: boolean) => {
    const modes = new Map((settings ?? []).map((item) => [item.name, item.mode]));
    modes.set(name, next ? 'auto' : 'disabled');
    const list: ToolSetting[] = [...modes.entries()].map(([toolName, mode]) => ({
      mode,
      name: toolName,
    }));
    // 全部是 auto 时归一成空数组（存库时会写成 null = 全部自动启用）
    onChange(list.every((item) => item.mode === 'auto') ? [] : list);
  };

  const enabled = catalog.filter((tool) => !disabledNames.has(tool.name));
  const disabled = catalog.filter((tool) => disabledNames.has(tool.name));

  const row = (tool: ToolItem) => {
    const Icon = TOOL_ICONS[tool.name] ?? Wrench;
    const checked = !disabledNames.has(tool.name);
    return (
      <div
        key={tool.name}
        style={{ alignItems: 'center', display: 'flex', gap: 10, padding: '6px 8px' }}
      >
        <Block align="center" flex="none" height={28} horizontal justify="center" variant="outlined" width={28}>
          <Icon size={14} />
        </Block>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13 }}>{tool.label}</Text>
          <div
            style={{
              fontSize: 11.5,
              opacity: 0.55,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={tool.description}
          >
            {tool.description}
          </div>
        </div>
        <Switch checked={checked} size="small" onChange={(next) => toggle(tool.name, next)} />
      </div>
    );
  };

  const section = (title: string, tools: ToolItem[]) =>
    tools.length > 0 && (
      <div>
        <div style={{ fontSize: 11, opacity: 0.45, padding: '6px 8px 2px' }}>{title}</div>
        {tools.map(row)}
      </div>
    );

  return (
    <Popover
      content={
        <div style={{ display: 'flex', flexDirection: 'column', padding: 6, width: 320 }}>
          <Flexbox align="center" horizontal justify="space-between" style={{ padding: '4px 8px' }}>
            <Text style={{ fontSize: 13, fontWeight: 600 }}>工具</Text>
            <Text style={{ fontSize: 11.5 }} type="secondary">
              {enabledCount}/{catalog.length} 已启用
            </Text>
          </Flexbox>

          {section('已启用', enabled)}
          {section('已禁用', disabled)}

          <div
            style={{
              borderTop: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.08))',
              fontSize: 11.5,
              marginTop: 6,
              opacity: 0.55,
              padding: '8px 8px 2px',
            }}
          >
            工具由模型自行决定何时调用；关掉的不会发给模型。开关随会话保存。
          </div>
        </div>
      }
      nativeButton={false}
      open={open}
      placement="topLeft"
      styles={{ content: { padding: 0 } }}
      trigger="click"
      onOpenChange={handleOpenChange}
    >
      <Block align="center" clickable gap={6} horizontal padding={6} title="工具" variant="borderless">
        <Icon icon={Blocks} size={16} />
        <Text style={{ fontSize: 12.5 }}>
          工具 {enabledCount}/{catalog.length || '…'}
        </Text>
        <Icon icon={ChevronDown} size={12} style={{ opacity: 0.5 }} />
      </Block>
    </Popover>
  );
});

ToolPicker.displayName = 'ToolPicker';
