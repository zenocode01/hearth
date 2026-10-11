'use client';

import { Block, Flexbox, Icon, Popover, Tag, Text } from '@lobehub/ui';
import { Switch } from '@lobehub/ui/base-ui';
import {
  ArrowUp,
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
  X,
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

/** 「悬停看说明」引导只看一次（首次打开面板播一段动效，之后不再提） */
const HINT_SEEN_KEY = 'hearth-tool-picker-hint-seen';

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
  // 当前要看说明的工具：悬停 / 点行 / Tab 聚焦都会更新，说明集中显示在面板底部（列表只留图标 + 名字）
  const [detail, setDetail] = useState<ToolItem | null>(null);
  const [payload, setPayload] = useState<ToolPayload>({ runtime: 'builtin', tools: [] });
  const [hint, setHint] = useState(false);

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

  // 首次打开：底部播一段“往上指”的引导，同时首行亮一下；播完写标记，以后不再打扰
  useEffect(() => {
    if (!open) return;
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    setHint(true);
    const timer = setTimeout(() => {
      setHint(false);
      try {
        localStorage.setItem(HINT_SEEN_KEY, '1');
      } catch {
        /* 隐私模式下存不下，下次再播 */
      }
    }, 3200);
    return () => clearTimeout(timer);
  }, [open]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        void load();
      } else {
        setDetail(null);
      }
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

  const row = (tool: ToolItem, hintRow = false) => {
    const Icon = TOOL_ICONS[tool.name] ?? Wrench;
    const checked = isEnabled(tool);
    return (
      <div
        className={hintRow && hint ? 'hearth-tool-row hearth-tool-row-hint' : 'hearth-tool-row'}
        data-active={detail?.name === tool.name}
        key={tool.name}
        onClick={() => setDetail(tool)}
        onFocus={() => setDetail(tool)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setDetail(tool);
          }
        }}
        onMouseEnter={() => setDetail(tool)}
        tabIndex={0}
      >
        <Block align="center" flex="none" height={24} horizontal justify="center" variant="outlined" width={24}>
          <Icon size={13} />
        </Block>
        <span className="hearth-tool-name">{tool.label}</span>
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
        <div style={{ display: 'flex', flexDirection: 'column', padding: 6, width: 288 }}>
          <div className="hearth-tool-head">
            <Text style={{ fontSize: 13, fontWeight: 600 }}>
              {payload.runtime === 'pi' ? 'pi 自带的工具' : '工具'}
            </Text>
            {payload.tools.length > 0 && (
              // 启用数不用写“已启用”：数字 + 一条按比例生长的进度条，开关一切就动一下
              <div
                className="hearth-tool-count"
                title={`已启用 ${enabledCount}/${payload.tools.length}`}
              >
                <span className="hearth-tool-count-num" key={enabledCount}>
                  {enabledCount}
                  <span className="hearth-tool-count-total">/{payload.tools.length}</span>
                </span>
                <span className="hearth-tool-count-bar">
                  <i
                    style={{ width: `${Math.round((enabledCount / payload.tools.length) * 100)}%` }}
                  />
                </span>
              </div>
            )}
          </div>

          {payload.tools.length > 0 && (
            <div className="hearth-scroll" style={{ maxHeight: 252, overflowY: 'auto' }}>
              {isBuiltin ? (
                payload.tools.map((tool, index) => row(tool, index === 0))
              ) : (
                // pi：按来源分组（内置 / 扩展），但不写小标题——极简，来路在底部详情里写明。
                // 开关随会话保存，运行时注入 --tools / --exclude-tools（见底部 note）。
                <>
                  {payload.tools.some((tool) => tool.source !== 'extension') &&
                    payload.tools
                      .filter((tool) => tool.source !== 'extension')
                      .map((tool, index) => row(tool, index === 0))}
                  {payload.tools.some((tool) => tool.source !== 'extension') &&
                    payload.tools.some((tool) => tool.source === 'extension') && (
                      <div className="hearth-tool-divider" />
                    )}
                  {payload.tools.some((tool) => tool.source === 'extension') &&
                    payload.tools
                      .filter((tool) => tool.source === 'extension')
                      .map((tool, index) =>
                        row(tool, payload.tools.some((item) => item.source !== 'extension') ? false : index === 0),
                      )}
                </>
              )}
            </div>
          )}

          {(detail || payload.note || payload.settingsPath) && (
            <div className="hearth-tool-foot hearth-scroll">
              {hint && !detail && (
                <div className="hearth-tool-hint">
                  <Icon icon={ArrowUp} size={11} />
                  悬停工具行看说明
                </div>
              )}
              {detail ? (
                <div className="hearth-collapse-in" key={detail.name}>
                  <Flexbox align="center" gap={6} horizontal>
                    <Text style={{ fontSize: 12.5, fontWeight: 600 }}>{detail.label}</Text>
                    <Text style={{ fontSize: 11, opacity: 0.45 }}>
                      {detail.name}
                      {detail.source ? ` · ${detail.source === 'extension' ? '扩展' : '内置'}` : ''}
                    </Text>
                    <span style={{ flex: 1 }} />
                    <Tag size="small" style={{ opacity: isEnabled(detail) ? 1 : 0.45 }}>
                      {isEnabled(detail) ? '已启用' : '未启用'}
                    </Tag>
                    <Block
                      align="center"
                      clickable
                      flex="none"
                      height={20}
                      horizontal
                      justify="center"
                      title="收起说明"
                      variant="borderless"
                      width={20}
                      onClick={() => setDetail(null)}
                    >
                      <Icon icon={X} size={12} />
                    </Block>
                  </Flexbox>
                  <div className="hearth-tool-foot-body">
                    {detail.description || '该工具没有说明。'}
                  </div>
                </div>
              ) : (
                <div className="hearth-tool-note">
                  {payload.note}
                  {payload.settingsPath && payload.runtime === 'pi' && (
                    <div style={{ marginTop: 2 }}>配置：{payload.settingsPath}</div>
                  )}
                </div>
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
