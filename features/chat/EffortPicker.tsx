'use client';

import { Dropdown, Menu } from 'antd';
import { ChevronDown } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';

import { REASONING_EFFORTS } from '@/lib/llm/reasoning';

interface EffortPickerProps {
  /** 当前 Agent（决定哪些档位真生效）；null = 不限 */
  agentId: string | null;
  onChange: (value: string) => void;
  /** 空字符串 = 跟随 Agent */
  value: string;
}

/**
 * 工具栏里的思考等级切换（会话级，覆盖 Agent 的设置）。
 *
 * 参考 LobeHub 的 ActionBar\Model：chip 触发器 + DropdownMenu 菜单，
 * 不是原生 Select。chip 显示当前值（如"思考 中"），点开是菜单，
 * 菜单里当前选中的档位高亮。
 *
 * 与 Agent 编辑页那个下拉的区别：这里改的是**当前会话**，
 * 不用跳到 Agent 设置页；「跟随 Agent」这一档随时能回去。
 *
 * 档位经能力门过滤：模型不支持的（比如关不掉思考的模型上的
 * 「关闭」）不显示——选了也不会报错，但不会有任何变化。
 * 读不到能力信息时不限制（全给）。
 */
export const EffortPicker = memo(({ agentId, onChange, value }: EffortPickerProps) => {
  const [supported, setSupported] = useState<string[] | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});

  useEffect(() => {
    const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
    let cancelled = false;
    void fetch(`/api/reasoning/levels${query}`)
      .then((res) => res.json())
      .then(
        (data: { aliases?: Record<string, string>; supported?: string[] | null }) => {
          if (cancelled) return;
          setSupported(data.supported ?? null);
          setAliases(data.aliases ?? {});
        },
      )
      .catch(() => {
        if (!cancelled) setSupported(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const levels = REASONING_EFFORTS.filter(
    (item) => !supported || supported.includes(item.value),
  );

  const menu = useMemo(
    () => ({
      items: [
        { key: '', label: '跟随 Agent' },
        ...levels.map((item) => ({
          key: item.value,
          label: aliases[item.value]
            ? `${item.label}（按「${aliases[item.value]}」跑）`
            : item.label,
        })),
      ],
      onClick: ({ key }: { key: string }) => onChange(key),
      selectedKeys: [value],
    }),
    [aliases, levels, onChange, value],
  );

  const currentLabel = value
    ? REASONING_EFFORTS.find((item) => item.value === value)?.label ?? value
    : '跟随';

  return (
    <Dropdown menu={menu} trigger={['click']}>
      <div
        style={{
          alignItems: 'center',
          borderRadius: 6,
          color: 'var(--ant-color-text-secondary, rgba(0,0,0,0.65))',
          cursor: 'pointer',
          display: 'flex',
          fontSize: 12,
          gap: 4,
          height: 28,
          paddingInline: 8,
          whiteSpace: 'nowrap',
        }}
      >
        <span>思考</span>
        <span style={{ color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))' }}>
          {currentLabel}
        </span>
        <ChevronDown size={12} />
      </div>
    </Dropdown>
  );
});

EffortPicker.displayName = 'EffortPicker';
