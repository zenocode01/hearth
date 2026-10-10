'use client';

import { Block, Icon, Popover, Text } from '@lobehub/ui';
import { Check, ChevronsUpDown, Plug, Settings, Sparkles } from 'lucide-react';
import { memo, useState, type ReactNode } from 'react';

import type { Agent } from '@/lib/db/schema';

import { AgentAvatar } from '../agent/AgentAvatar';

interface SwitcherRowProps {
  active?: boolean;
  avatar: ReactNode | string;
  /** 与 avatar 搭配的底色（emoji 头像时用） */
  background?: string | null;
  onClick: () => void;
  subtitle?: string;
  title: string;
}

const SwitcherRow = memo(
  ({ title, subtitle, avatar, background, active, onClick }: SwitcherRowProps) => (
    <div
      onClick={onClick}
      style={{
        alignItems: 'center',
        background: active ? 'var(--ant-color-fill-secondary, rgba(0, 0, 0, 0.06))' : undefined,
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex',
        gap: 8,
        padding: '6px 8px',
      }}
    >
      <span style={{ alignItems: 'center', display: 'inline-flex', flexShrink: 0, width: 24 }}>
        {typeof avatar === 'string' ? (
          <AgentAvatar avatar={avatar} background={background} size={24} />
        ) : (
          avatar
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Text ellipsis style={{ fontSize: 13 }}>
          {title}
        </Text>
        {subtitle && (
          <div
            style={{
              fontSize: 11,
              opacity: 0.55,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        )}
      </span>
      {active && <Icon icon={Check} size={14} />}
    </div>
  ),
);

SwitcherRow.displayName = 'SwitcherRow';

interface AgentSwitcherProps {
  activeAgentId: string | null;
  agents: Agent[];
  /** 传空字符串表示"默认 Agent" */
  onChange: (agentId: string) => void;
  onManage: () => void;
  /** 打开「技能」页 */
  onManageSkills: () => void;
  /** 打开「MCP」页 */
  onManageMcp: () => void;
}

/**
 * 侧栏顶部的 Agent 切换器（参考 refs 的 AgentSidebar/Header/Agent）：
 * 触发器显示当前 Agent 的头像 + 名字，点开是切换面板。
 * 触发器必须是非 <button>（base-ui 要求 nativeButton={false}）。
 */
export const AgentSwitcher = memo(
  ({ agents, activeAgentId, onChange, onManage, onManageSkills, onManageMcp }: AgentSwitcherProps) => {
    const [open, setOpen] = useState(false);
    const current = agents.find((agent) => agent.id === activeAgentId) ?? null;
    const label = current?.name ?? '默认 Agent';
    const avatar = current?.avatar ?? '🤖';

    const select = (agentId: string, action?: () => void) => {
      setOpen(false);
      if (action) action();
      else onChange(agentId);
    };

    return (
      <Popover
        content={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 6, width: 240 }}>
            <SwitcherRow
              active={!activeAgentId}
              avatar="🤖"
              title="默认 Agent"
              onClick={() => select('')}
            />
            {agents.map((agent) => (
              <SwitcherRow
                active={agent.id === activeAgentId}
                avatar={agent.avatar ?? '😀'}
                background={agent.backgroundColor}
                key={agent.id}
                subtitle={agent.runtime === 'cli' ? '外部 CLI' : (agent.model ?? '默认模型')}
                title={agent.name}
                onClick={() => select(agent.id)}
              />
            ))}
            <div
              style={{
                borderTop: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.08))',
                margin: '4px 0',
              }}
            />
            <SwitcherRow
              avatar={<Icon icon={Settings} size={16} />}
              title="管理 Agent"
              onClick={() => select('', onManage)}
            />
            <SwitcherRow
              avatar={<Icon icon={Sparkles} size={16} />}
              subtitle="本地 SKILL.md 技能"
              title="技能"
              onClick={() => select('', onManageSkills)}
            />
            <SwitcherRow
              avatar={<Icon icon={Plug} size={16} />}
              subtitle="外部 MCP server 的工具"
              title="MCP"
              onClick={() => select('', onManageMcp)}
            />
          </div>
        }
        nativeButton={false}
        open={open}
        placement="bottomLeft"
        styles={{ content: { padding: 0 } }}
        trigger="click"
        onOpenChange={setOpen}
      >
        <Block align="center" clickable gap={8} horizontal padding={6} variant="borderless">
          <AgentAvatar avatar={avatar} background={current?.backgroundColor} size={24} />
          <Text ellipsis style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            {label}
          </Text>
          <Icon icon={ChevronsUpDown} size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
        </Block>
      </Popover>
    );
  },
);

AgentSwitcher.displayName = 'AgentSwitcher';
