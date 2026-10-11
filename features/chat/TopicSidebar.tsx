'use client';

import { Button, Icon, Input, Popover, Text } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import {
  Check,
  Clock,
  Download,
  FileJson,
  FileText,
  FolderClosed,
  FolderOpen,
  History,
  List,
  MessageCircleQuestion,
  MessageSquarePlus,
  SlidersHorizontal,
  SquarePen,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { useConfirmDelete } from '@/components/confirmDialog';
import { Delayed } from '@/components/Delayed';
import { ListSkeleton } from '@/components/ListSkeleton';
import type { Agent, Topic } from '@/lib/db/schema';
import { toTime } from '@/lib/db/time';
import { exportFilename, type ExportFormat } from '@/lib/export/topicExport';

import { AgentSwitcher } from './AgentSwitcher';
import {
  readPref,
  SIDEBAR_SORT_KEY,
  SIDEBAR_VIEW_KEY,
  writePref,
  type SidebarSort,
  type SidebarView,
} from './sidebarPrefs';

const VIEW_VALUES = ['flat', 'agent'] as const;
const SORT_VALUES = ['activity', 'created'] as const;

interface TopicRowProps {
  active: boolean;
  /** 分组视图里缩进一级（会话是二级节点，一级是 Agent） */
  indent?: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  topic: Topic;
  /** 这个会话有等待回答的提问（跨会话提示的侧边栏徽章） */
  waiting?: boolean;
}

const TopicRow = memo(({ topic, active, indent, onSelect, onRename, onDelete, waiting }: TopicRowProps) => {
  const [editing, setEditing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [draft, setDraft] = useState(topic.title);
  const confirm = useConfirmDelete();

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
        padding: indent ? '6px 8px 6px 22px' : '6px 8px',
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
              confirm.open({
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

      {confirm.modal}
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

interface MenuRowProps {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

/** 「列表设置」菜单里的一行：左图标 + 名字 + 选中打勾（对标 LIMS 侧栏） */
const MenuRow = memo(({ active, icon, label, onClick }: MenuRowProps) => (
  <div className="hearth-menu-row" data-active={active} onClick={onClick}>
    <Icon icon={icon} size={14} />
    <span style={{ flex: 1 }}>{label}</span>
    {active && <Icon icon={Check} size={13} style={{ opacity: 0.65 }} />}
  </div>
));

MenuRow.displayName = 'MenuRow';

interface GroupHeaderProps {
  collapsed: boolean;
  count: number;
  label: string;
  onToggle: () => void;
}

/** 分组视图的一级节点：文件夹图标 + Agent 名 + 会话数，点一下折叠 / 展开 */
const GroupHeader = memo(({ collapsed, count, label, onToggle }: GroupHeaderProps) => (
  <div
    className="hearth-topic-group"
    onClick={onToggle}
    title={collapsed ? '展开这一组' : '折叠这一组'}
  >
    <Icon icon={collapsed ? FolderClosed : FolderOpen} size={13} />
    <span className="hearth-topic-group-name">{label}</span>
    <span className="hearth-topic-group-count">{count}</span>
  </div>
));

GroupHeader.displayName = 'GroupHeader';

/**
 * 左侧栏：Agent 切换器 + 新建会话 + 会话列表。
 *
 * 列表两种视图（平铺 / 按 Agent 分组）、两种排序（手动 / 按最近活动），
 * 偏好是用户级的，存 localStorage（见 sidebarPrefs.ts）；菜单结构对标 LIMS 侧栏。
 */
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
  }: TopicSidebarProps) => {
    const [view, setView] = useState<SidebarView>(() =>
      readPref(SIDEBAR_VIEW_KEY, VIEW_VALUES, 'flat'),
    );
    const [sort, setSort] = useState<SidebarSort>(() =>
      readPref(SIDEBAR_SORT_KEY, SORT_VALUES, 'activity'),
    );
    const [prefsOpen, setPrefsOpen] = useState(false);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

    const sorted = useMemo(() => {
      const list = [...topics];
      // 必须过 toTime()：`/api/topics` 过来的是 ISO 字符串，不是 Date（schema 类型在骗人，见 lib/db/time.ts）
      if (sort === 'activity') list.sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
      else list.sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));
      return list;
    }, [topics, sort]);

    // 一级 = Agent（Hearth 没有 LIMS 那个「工作区」概念，最接近的是会话归属的 Agent）
    const groups = useMemo(() => {
      const list: Array<{ agentId: string | null; label: string; topics: Topic[] }> = agents.map(
        (agent) => ({
          agentId: agent.id,
          label: agent.name,
          topics: sorted.filter((topic) => topic.agentId === agent.id),
        }),
      );
      const known = new Set(agents.map((agent) => agent.id));
      const orphans = sorted.filter((topic) => !topic.agentId || !known.has(topic.agentId));
      if (orphans.length > 0) list.push({ agentId: null, label: '未指定助手', topics: orphans });
      return list;
    }, [agents, sorted]);

    const rows = (list: Topic[], indent: boolean) =>
      list.map((topic) => (
        <TopicRow
          active={topic.id === activeId}
          indent={indent}
          key={topic.id}
          topic={topic}
          waiting={pendingTopicIds?.has(topic.id)}
          onDelete={onDelete}
          onRename={onRename}
          onSelect={onSelect}
        />
      ));

    const prefsMenu = (
      <div style={{ display: 'flex', flexDirection: 'column', padding: 6, width: 176 }}>
        <div className="hearth-menu-label">视图</div>
        <MenuRow
          active={view === 'flat'}
          icon={List}
          label="平铺列表"
          onClick={() => {
            setView('flat');
            writePref(SIDEBAR_VIEW_KEY, 'flat');
          }}
        />
        <MenuRow
          active={view === 'agent'}
          icon={FolderOpen}
          label="按 Agent 分组"
          onClick={() => {
            setView('agent');
            writePref(SIDEBAR_VIEW_KEY, 'agent');
          }}
        />
        <div className="hearth-menu-label">排序</div>
        <MenuRow
          active={sort === 'created'}
          icon={History}
          label="按创建时间（早的在前）"
          onClick={() => {
            setSort('created');
            writePref(SIDEBAR_SORT_KEY, 'created');
          }}
        />
        <MenuRow
          active={sort === 'activity'}
          icon={Clock}
          label="按最近活动"
          onClick={() => {
            setSort('activity');
            writePref(SIDEBAR_SORT_KEY, 'activity');
          }}
        />
      </div>
    );

    return (
      <div
        style={{
          background: 'var(--ant-color-bg-container, #fff)',
          borderRight: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          gap: 6,
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
        {/* 新建会话：图标 + 文字的动作行，不是整宽按钮（对标 LIMS 侧栏顶部） */}
        <div className="hearth-topic-action" onClick={onCreate}>
          <Icon icon={MessageSquarePlus} size={15} />
          <span>新建会话</span>
        </div>

        {/* 区头：弱色小标题 + 列表设置入口（新建只有一个入口：上面那行，别重复摆两个按钮） */}
        <div className="hearth-topic-head">
          <span className="hearth-topic-head-label">会话</span>
          <div style={{ alignItems: 'center', display: 'flex', gap: 2 }}>
            <Popover
              content={prefsMenu}
              nativeButton
              open={prefsOpen}
              placement="bottomRight"
              styles={{ content: { padding: 0 } }}
              trigger="click"
              onOpenChange={setPrefsOpen}
            >
              <Button size="small" title="列表设置" type="text">
                <Icon icon={SlidersHorizontal} size={14} />
              </Button>
            </Popover>
          </div>
        </div>

        <div
          className="hearth-scroll"
          style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 2, overflowY: 'auto' }}
        >
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
          ) : view === 'flat' ? (
            rows(sorted, false)
          ) : (
            groups.map((group) => {
              const key = group.agentId ?? '__none';
              const isCollapsed = collapsed.has(key);
              return (
                <div key={key}>
                  <GroupHeader
                    collapsed={isCollapsed}
                    count={group.topics.length}
                    label={group.label}
                    onToggle={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  />
                  {isCollapsed ? null : group.topics.length === 0 ? (
                    <span
                      style={{ display: 'block', fontSize: 12, opacity: 0.5, padding: '4px 8px 4px 24px' }}
                    >
                      暂无对话
                    </span>
                  ) : (
                    rows(group.topics, true)
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  },
);

TopicSidebar.displayName = 'TopicSidebar';
