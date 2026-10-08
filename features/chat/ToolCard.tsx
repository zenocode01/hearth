'use client';

import { Block, Icon } from '@lobehub/ui';
import { Spin } from '@lobehub/ui/base-ui';
import {
  Calculator,
  ChevronDown,
  Clock,
  FilePlus,
  FileSearch,
  FileText,
  FolderTree,
  Globe,
  Pencil,
  Play,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { memo, useState } from 'react';

/**
 * 工具调用卡片（参考 refs 的 Conversation 工具卡）：
 * - 一行标题：工具图标 + 中文名 + 关键参数摘要 + 状态（调用中/完成/失败）+ 折叠箭头
 * - 展开后显示「参数」与「结果」（JSON 美化）
 */
interface ToolCardProps {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  state: string;
  toolCallId: string;
  toolName: string;
}

const TOOL_META: Record<string, { icon: LucideIcon; label: string }> = {
  // Hearth 内置工具
  calculate: { icon: Calculator, label: '计算器' },
  fetch_url: { icon: Globe, label: '抓取网页' },
  get_current_time: { icon: Clock, label: '当前时间' },
  // pi 自带的工具（外部 CLI 运行时）
  bash: { icon: Terminal, label: '执行命令' },
  edit: { icon: Pencil, label: '编辑文件' },
  find: { icon: FileSearch, label: '查找文件' },
  grep: { icon: Search, label: '搜索内容' },
  ls: { icon: FolderTree, label: '列目录' },
  powershell: { icon: Play, label: 'PowerShell' },
  read: { icon: FileText, label: '读取文件' },
  write: { icon: FilePlus, label: '写入文件' },
};

const Chevron = ({ open }: { open: boolean }) => (
  <span
    style={{
      display: 'inline-flex',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s ease',
    }}
  >
    <Icon icon={ChevronDown} size={14} />
  </span>
);

/** 从参数里挑一个最能说明问题的值做摘要 */
function summarizeInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    // 内置工具 + pi 自带工具（bash 的 command、read/edit 的 path/file、grep 的 pattern…）
    for (const key of [
      'command',
      'expression',
      'url',
      'query',
      'pattern',
      'glob',
      'path',
      'file',
      'file_path',
      'timezone',
      'text',
    ]) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === 'string' && value) return value;
    }
    const first = Object.values(input as Record<string, unknown>).find((v) => typeof v === 'string');
    if (typeof first === 'string') return first;
  }
  return '';
}

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const ToolCard = memo(({ toolName, input, output, errorText, state }: ToolCardProps) => {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[toolName] ?? { icon: Wrench, label: toolName };

  const running = state === 'input-streaming' || state === 'input-available';
  const failed = state === 'output-error';
  const statusLabel = running ? '调用中…' : failed ? '失败' : '已完成';
  const summary = summarizeInput(input);
  const hasBody = input != null || output != null || Boolean(errorText);

  return (
    <div style={{ margin: '6px 0' }}>
      <button
        type="button"
        onClick={() => hasBody && setOpen((value) => !value)}
        style={{
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: hasBody ? 'pointer' : 'default',
          display: 'inline-flex',
          gap: 8,
          maxWidth: '100%',
          padding: '4px 0',
        }}
      >
        <Block
          align="center"
          flex="none"
          height={24}
          horizontal
          justify="center"
          variant="outlined"
          width={24}
        >
          {running ? <Spin size="small" /> : <Icon icon={meta.icon} size={14} />}
        </Block>

        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{meta.label}</span>

        {summary && (
          <span
            style={{
              color: 'var(--ant-color-text-description, rgba(0, 0, 0, 0.45))',
              fontSize: 12.5,
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {summary}
          </span>
        )}

        <span
          className={running ? 'hearth-thinking' : undefined}
          style={{
            color: failed
              ? 'var(--ant-color-error, #ff4d4f)'
              : 'var(--ant-color-text-description, rgba(0, 0, 0, 0.45))',
            fontSize: 12,
          }}
        >
          {statusLabel}
        </span>

        {hasBody && <Chevron open={open} />}
      </button>

      {open && hasBody && (
        <div
          className="hearth-scroll hearth-collapse-in"
          style={{
            borderLeft: '2px solid var(--ant-color-border, rgba(0, 0, 0, 0.12))',
            color: 'var(--ant-color-text-description, rgba(0, 0, 0, 0.45))',
            display: 'flex',
            flexDirection: 'column',
            fontSize: 12.5,
            gap: 6,
            lineHeight: 1.7,
            marginTop: 4,
            maxHeight: 'min(40vh, 320px)',
            overflowY: 'auto',
            paddingLeft: 10,
          }}
        >
          {input != null && (
            <div>
              <span style={{ opacity: 0.7 }}>参数：</span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{formatValue(input)}</span>
            </div>
          )}
          {errorText ? (
            <div style={{ color: 'var(--ant-color-error, #ff4d4f)' }}>错误：{errorText}</div>
          ) : (
            output != null && (
              <div>
                <span style={{ opacity: 0.7 }}>结果：</span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{formatValue(output)}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
});

ToolCard.displayName = 'ToolCard';
