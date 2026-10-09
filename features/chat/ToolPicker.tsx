'use client';

import { Block, Flexbox, Icon, Popover, Tag, Text } from '@lobehub/ui';
import { Switch } from '@lobehub/ui/base-ui';
import {
  Blocks,
  Calculator,
  ChevronDown,
  Clock,
  FilePlus,
  FileSearch,
  FileText,
  FolderTree,
  Globe,
  ListChecks,
  MessageCircleQuestion,
  Pencil,
  Play,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';

import type { ToolSetting } from '@/lib/tools/settings';

interface ToolItem {
  description: string;
  /** pi 工具才有：实时读自 pi 的 settings.json / 会话文件 */
  enabled?: boolean;
  label: string;
  name: string;
  /** pi 才有：内置还是扩展（本地扩展 / npm 包） */
  source?: 'builtin' | 'extension';
}

interface ToolPayload {
  enabledCount?: number;
  note?: string;
  runtime: 'builtin' | 'external' | 'pi';
  settingsPath?: string;
  tools: ToolItem[];
}

/** 图标：Hearth 内置工具 + pi 自带工具 + 扩展工具 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  // Hearth 内置
  calculate: Calculator,
  fetch_url: Globe,
  get_current_time: Clock,
  // pi 自带
  bash: Terminal,
  edit: Pencil,
  find: FileSearch,
  grep: Search,
  ls: FolderTree,
  powershell: Play,
  read: FileText,
  write: FilePlus,
  // 常见 pi 扩展
  question: MessageCircleQuestion,
  todo: ListChecks,
  web_search: Search,
  fetch_content: Globe,
};

interface ToolPickerProps {
  /** 当前会话的 Agent（决定显示哪套工具：内置 / pi 自带 / 外部 CLI 自管） */
  agentId?: string | null;
  /** 内置工具的开关（[] 或 null = 全部自动启用） */
  onChange: (settings: ToolSetting[]) => void;
  settings: ToolSetting[] | null;
}

/**
 * 输入框上的「工具」入口（参考 refs 的 ChatInput/ActionBar/Tools）：
 * - 内置模型 → Hearth 内置工具，可开关（随会话保存）
 * - 外部 CLI = pi → **pi 自带的工具**（启用状态实时读 pi 的 settings.json，只读展示）
 * - 其它外部 CLI → 说明工具由该 CLI 自己管理
 */
export const ToolPicker = memo(({ agentId, settings, onChange }: ToolPickerProps) => {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ToolPayload>({ runtime: 'builtin', tools: [] });

  const load = useCallback(async () => {
    try {
      const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
      const res = await fetch(`/api/tools${query}`);
      if (!res.ok) return;
      setPayload((await res.json()) as ToolPayload);
    } catch {
      /* 打开面板时会重试 */
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void load();
    },
    [load],
  );

  const disabledNames = new Set(
    (settings ?? []).filter((item) => item.mode === 'disabled').map((item) => item.name),
  );
  const autoNames = new Set(
    (settings ?? []).filter((item) => item.mode === 'auto').map((item) => item.name),
  );
  const isBuiltin = payload.runtime === 'builtin';
  const isPi = payload.runtime === 'pi';
  /** 有效启用状态：会话开关优先，其次 pi 自己的设置（pi 默认 read/bash/edit/write） */
  const isEnabled = (tool: ToolItem) => {
    if (disabledNames.has(tool.name)) return false;
    if (autoNames.has(tool.name)) return true;
    return isBuiltin ? true : Boolean(tool.enabled);
  };
  const enabledCount = payload.tools.filter(isEnabled).length;

  /** pi 侧本来就开着的工具（read/bash/edit/write + 扩展）——它们的 'auto' 覆盖可以省掉 */
  const isDefaultOn = (name: string) => {
    if (isBuiltin) return true;
    return Boolean(payload.tools.find((tool) => tool.name === name)?.enabled);
  };

  const toggle = (name: string, next: boolean) => {
    const modes = new Map((settings ?? []).map((item) => [item.name, item.mode]));
    modes.set(name, next ? 'auto' : 'disabled');
    const list: ToolSetting[] = [...modes.entries()].map(([toolName, mode]) => ({
      mode,
      name: toolName,
    }));
    // 归一成空数组（存库时写成 null = 全部按各自默认）：只丢"本来就是开"的 auto 条目。
    // **不能**无脑全丢：pi 默认关的工具（powershell/grep/find/ls）一旦丢掉 'auto'，
    // 就等于没覆盖 → pi 的默认"关"又赢回来，开关会弹回关（2026-10-08 修）。
    const effective = list.filter((item) => !(item.mode === 'auto' && isDefaultOn(item.name)));
    onChange(effective.length === 0 ? [] : effective);
  };

  const row = (tool: ToolItem) => {
    const Icon = TOOL_ICONS[tool.name] ?? Wrench;
    const checked = isEnabled(tool);
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
        {isBuiltin || isPi ? (
          <Switch checked={checked} size="small" onChange={(next) => toggle(tool.name, next)} />
        ) : (
          <Tag size="small" style={{ opacity: checked ? 1 : 0.45 }}>
            {checked ? '已启用' : '未启用'}
          </Tag>
        )}
      </div>
    );
  };

  const triggerLabel = isBuiltin
    ? `工具 ${enabledCount}/${payload.tools.length || '…'}`
    : payload.runtime === 'pi'
      ? `pi 工具 ${enabledCount}/${payload.tools.length || '…'}`
      : '工具';

  return (
    <Popover
      content={
        <div style={{ display: 'flex', flexDirection: 'column', padding: 6, width: 340 }}>
          <Flexbox align="center" horizontal justify="space-between" style={{ padding: '4px 8px' }}>
            <Text style={{ fontSize: 13, fontWeight: 600 }}>
              {payload.runtime === 'pi' ? 'pi 自带的工具' : '工具'}
            </Text>
            <Text style={{ fontSize: 11.5 }} type="secondary">
              {payload.tools.length > 0 ? `${enabledCount}/${payload.tools.length} 已启用` : ''}
            </Text>
          </Flexbox>

          {payload.tools.length > 0 && (
            <div>
              {isBuiltin ? (
                <>
                  <div style={{ fontSize: 11, opacity: 0.45, padding: '6px 8px 2px' }}>
                    可开关（随会话保存）
                  </div>
                  {payload.tools.map(row)}
                </>
              ) : (
                // pi：按来源分组（内置 / 扩展）；开关随会话保存，运行时注入 --tools / --exclude-tools
                <>
                  {payload.tools.some((tool) => tool.source === 'builtin') && (
                    <>
                      <div style={{ fontSize: 11, opacity: 0.45, padding: '6px 8px 2px' }}>
                        内置工具（可开关，随会话保存）
                      </div>
                      {payload.tools.filter((tool) => tool.source !== 'extension').map(row)}
                    </>
                  )}
                  {payload.tools.some((tool) => tool.source === 'extension') && (
                    <>
                      <div style={{ fontSize: 11, opacity: 0.45, padding: '6px 8px 2px' }}>
                        扩展工具（本地扩展 / npm 包）
                      </div>
                      {payload.tools.filter((tool) => tool.source === 'extension').map(row)}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {(payload.note || payload.settingsPath) && (
            <div
              style={{
                borderTop: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.08))',
                fontSize: 11.5,
                lineHeight: 1.6,
                marginTop: 6,
                opacity: 0.55,
                padding: '8px 8px 2px',
                wordBreak: 'break-all',
              }}
            >
              {payload.note}
              {payload.settingsPath && payload.runtime === 'pi' && (
                <div style={{ marginTop: 2 }}>配置：{payload.settingsPath}</div>
              )}
            </div>
          )}
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
        <Text style={{ fontSize: 12.5 }}>{triggerLabel}</Text>
        <Icon icon={ChevronDown} size={12} style={{ opacity: 0.5 }} />
      </Block>
    </Popover>
  );
});

ToolPicker.displayName = 'ToolPicker';
