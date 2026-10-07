'use client';

import { Button, Icon, Input, Text } from '@lobehub/ui';
import { MessageSquarePlus, SquarePen, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';

import { Delayed } from '@/components/Delayed';
import { ListSkeleton } from '@/components/ListSkeleton';
import type { Agent, Topic } from '@/lib/db/schema';

import { AgentSwitcher } from './AgentSwitcher';

interface TopicRowProps {
  active: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  topic: Topic;
}

const TopicRow = memo(({ topic, active, onSelect, onRename, onDelete }: TopicRowProps) => {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(topic.title);

  const save = () => {
    const next = draft.trim();
    if (next && next !== topic.title) onRename(topic.id, next);
    setEditing(false);
  };

  return (
    <div
      onClick={() => !editing && !confirming && onSelect(topic.id)}
      style={{
        alignItems: 'center',
        background: active ? 'var(--ant-color-fill-secondary, rgba(0, 0, 0, 0.06))' : undefined,
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex',
        gap: 6,
        minHeight: 36,
        padding: '6px 8px',
      }}
    >
      {editing ? (
        <Input
          autoFocus
          size="small"
          value={draft}
          onBlur={save}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') {
              setDraft(topic.title);
              setEditing(false);
            }
          }}
          onPressEnter={save}
        />
      ) : confirming ? (
        <div style={{ alignItems: 'center', display: 'flex', flex: 1, gap: 6 }}>
          <Text style={{ flex: 1, fontSize: 13 }} type="danger">
            删除？
          </Text>
          <Button danger size="small" onClick={() => onDelete(topic.id)}>
            删除
          </Button>
          <Button size="small" onClick={() => setConfirming(false)}>
            取消
          </Button>
        </div>
      ) : (
        <>
          <Text ellipsis style={{ flex: 1, fontSize: 13 }} title={topic.title}>
            {topic.title}
          </Text>
          <Button
            size="small"
            title="改名"
            type="text"
            onClick={(event) => {
              event.stopPropagation();
              setDraft(topic.title);
              setEditing(true);
            }}
          >
            <Icon icon={SquarePen} size={14} />
          </Button>
          <Button
            size="small"
            title="删除"
            type="text"
            onClick={(event) => {
              event.stopPropagation();
              setConfirming(true);
            }}
          >
            <Icon icon={Trash2} size={14} />
          </Button>
        </>
      )}
    </div>
  );
});

TopicRow.displayName = 'TopicRow';

interface TopicSidebarProps {
  activeAgentId: string | null;
  activeId: string | null;
  agents: Agent[];
  onAgentChange: (agentId: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onManageAgents: () => void;
  onRename: (id: string, title: string) => void;
  onRetryTopics: () => void;
  onSelect: (id: string) => void;
  topics: Topic[];
  topicsError: boolean;
  topicsLoading: boolean;
}

/** 左侧栏：顶部 Agent 切换器 + 新建对话 + 会话列表（切换 / 改名 / 删除）。 */
export const TopicSidebar = memo(
  ({
    topics,
    activeId,
    activeAgentId,
    agents,
    onSelect,
    onCreate,
    onRename,
    onDelete,
    onAgentChange,
    onManageAgents,
    onRetryTopics,
    topicsError,
    topicsLoading,
  }: TopicSidebarProps) => (
    <div
      style={{
        borderRight: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        gap: 8,
        padding: 8,
        width: 240,
      }}
    >
      {/* Agent 切换器放在会话列表上方（与 LobeHub 一致） */}
      <AgentSwitcher
        activeAgentId={activeAgentId}
        agents={agents}
        onChange={onAgentChange}
        onManage={onManageAgents}
      />
      <Button block icon={<Icon icon={MessageSquarePlus} size={16} />} onClick={onCreate}>
        新建对话
      </Button>
      <div className="hearth-scroll" style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {topicsLoading ? (
          <Delayed>
            <ListSkeleton rows={5} size="small" />
          </Delayed>
        ) : topicsError ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
            <Text style={{ fontSize: 12 }} type="danger">
              会话列表加载失败
            </Text>
            <Button size="small" onClick={onRetryTopics}>
              重试
            </Button>
          </div>
        ) : topics.length === 0 ? (
          <Text style={{ fontSize: 12, padding: 8 }} type="secondary">
            还没有会话
          </Text>
        ) : (
          topics.map((topic) => (
            <TopicRow
              active={topic.id === activeId}
              key={topic.id}
              topic={topic}
              onDelete={onDelete}
              onRename={onRename}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  ),
);

TopicSidebar.displayName = 'TopicSidebar';
