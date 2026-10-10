'use client';

import { Button, Icon, Input, Popover, Text } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { Download, FileJson, FileText, MessageCircleQuestion, MessageSquarePlus, SquarePen, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';

import { confirmDelete } from '@/components/confirmDialog';
import { Delayed } from '@/components/Delayed';
import { ListSkeleton } from '@/components/ListSkeleton';
import type { Agent, Topic } from '@/lib/db/schema';
import { exportFilename, type ExportFormat } from '@/lib/export/topicExport';

import { AgentSwitcher } from './AgentSwitcher';

interface TopicRowProps {
  active: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  topic: Topic;
  /** 这个会话有等待回答的提问（跨会话提示的侧边栏徽章） */
  waiting?: boolean;
}

const TopicRow = memo(({ topic, active, onSelect, onRename, onDelete, waiting }: TopicRowProps) => {
  const [editing, setEditing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [draft, setDraft] = useState(topic.title);

  const save = () => {
    const next = draft.trim();
    if (next && next !== topic.title) onRename(topic.id, next);
    setEditing(false);
  };

  /** 拉取导出内容并触发浏览器下载（失败 toast 提示）。 */
  const download = async (format: ExportFormat) => {
    setExportOpen(false);
    try {
      const res = await fetch(`/api/topics/${topic.id}/export?format=${format}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportFilename(topic.title, format);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${format === 'json' ? 'JSON' : 'Markdown'}`);
    } catch {
      toast.error('导出失败，请重试');
    }
  };

  return (
    <div
      onClick={() => !editing && onSelect(topic.id)}
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
      ) : (
        <>
          {waiting && (
            <span title="有等待回答的提问" style={{ display: 'flex', flexShrink: 0 }}>
              <Icon
                icon={MessageCircleQuestion}
                size={13}
                style={{ color: 'var(--ant-color-primary, #1677ff)' }}
              />
            </span>
          )}
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
          <Popover
            content={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 6, width: 200 }}>
                <Button
                  block
                  icon={<Icon icon={FileText} size={14} />}
                  type="text"
                  onClick={(event) => {
                    event.stopPropagation();
                    void download('md');
                  }}
                >
                  Markdown（.md）
                </Button>
                <Button
                  block
                  icon={<Icon icon={FileJson} size={14} />}
                  type="text"
                  onClick={(event) => {
                    event.stopPropagation();
                    void download('json');
                  }}
                >
                  JSON（.json）
                </Button>
                <Text style={{ fontSize: 11, opacity: 0.55, padding: '4px 8px' }} type="secondary">
                  .md 用于阅读分享；.json 完整备份（含思考过程）
                </Text>
              </div>
            }
            open={exportOpen}
            nativeButton
            placement="bottom"
            styles={{ content: { padding: 0 } }}
            trigger="click"
            onOpenChange={setExportOpen}
          >
            <Button
              size="small"
              title="导出"
              type="text"
              onClick={(event) => event.stopPropagation()}
            >
              <Icon icon={Download} size={14} />
            </Button>
          </Popover>
          <Button
            size="small"
            title="删除"
            type="text"
            onClick={(event) => {
              event.stopPropagation();
              confirmDelete({
                content: '删除后无法恢复，会话中的消息会一起删除。',
                onOk: () => onDelete(topic.id),
                title: `删除会话「${topic.title}」？`,
              });
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
  /** 打开「技能」页 */
  onManageSkills: () => void;
  /** 打开「MCP」页 */
  onManageMcp: () => void;
  onRename: (id: string, title: string) => void;
  onRetryTopics: () => void;
  onSelect: (id: string) => void;
  /** 有等待回答提问的会话 id 集合（侧边栏徽章） */
  pendingTopicIds?: Set<string>;
  topics: Topic[];
  topicsError: boolean;
  topicsLoading: boolean;
  /** 面板宽度（桌面 240；手机抽屉里可放宽） */
  width?: number | string;
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
    onManageSkills,
    onManageMcp,
    onRetryTopics,
    topicsError,
    topicsLoading,
    pendingTopicIds,
    width = 240,
  }: TopicSidebarProps) => (
    <div
      style={{
        background: 'var(--ant-color-bg-container, #fff)',
        borderRight: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        gap: 8,
        height: '100%',
        padding: 8,
        width,
      }}
    >
      {/* Agent 切换器放在会话列表上方（与 LobeHub 一致） */}
      <AgentSwitcher
        activeAgentId={activeAgentId}
        agents={agents}
        onChange={onAgentChange}
        onManage={onManageAgents}
        onManageSkills={onManageSkills}
        onManageMcp={onManageMcp}
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
              waiting={pendingTopicIds?.has(topic.id)}
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
