'use client';

import { useChat } from '@ai-sdk/react';
import { Button, Flexbox, Icon, Text, copyToClipboard } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { isToolUIPart, type UIMessage } from 'ai';
import { PanelLeft, Paperclip } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ThemeControls } from '@/components/ThemeControls';
import { useIsMobile } from '@/components/useMediaQuery';
import { parseStoredParts, deserializeParts } from '@/lib/db/messageParts';
import type { Agent, ChatMessage, Topic } from '@/lib/db/schema';
import { FILE_ACCEPT } from '@/lib/files/constants';
import { isPiCommand, isPiRpcCommand } from '@/lib/llm/piCommand';
import { parseToolSettings, type ToolSetting } from '@/lib/tools/settings';

import { AttachmentPreview } from './AttachmentPreview';
import { BackBottom } from './BackBottom';
import { ChatComposer } from './ChatComposer';
import { ContextMeter } from './ContextMeter';
import { EffortPicker } from './EffortPicker';
import { EmptyState } from './EmptyState';
import { findPendingQuestions, mergePendingQuestions } from './interventions';
import { MessageItem } from './MessageItem';
import type { MessageActionKey } from './MessageActions';
import { MessageSkeleton } from './MessageSkeleton';
import { PendingIsland } from './PendingIsland';
import { QuestionBar } from './QuestionBar';
import { SessionTree } from './SessionTree';
import { StreamingIndicator } from './StreamingIndicator';
import { TodoPanel } from './TodoPanel';
import { ToolPicker } from './ToolPicker';
import { TopicSidebar } from './TopicSidebar';
import { useAttachments } from './useAttachments';
import { usePendingRuns } from './usePendingRuns';

/** 距底多少像素内算"在底部" */
const BOTTOM_THRESHOLD = 32;

/** 聊天主视图：左侧会话列表 + 顶栏 + 消息列表 + 错误条 + 输入框。 */
export function ChatView() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsStatus, setTopicsStatus] = useState<'error' | 'loading' | 'ready'>('loading');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<'error' | 'loading' | 'ready'>('ready');
  /** 历史加载重试计数：+1 触发加载 effect 重跑 */
  const [historyAttempt, setHistoryAttempt] = useState(0);
  /** 输入框草稿（受控：支持"放回输入框"） */
  const [draft, setDraft] = useState('');
  /** 本会话的工具开关（[] = 全部自动启用） */
  const [toolSettings, setToolSettings] = useState<ToolSetting[]>([]);
  /** 本会话的思考等级覆盖（'' = 跟随 Agent） */
  const [topicEffort, setTopicEffort] = useState('');
  /** 手机端：侧栏抽屉是否打开 */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isMobile = useIsMobile();
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  /** 「发送后钉顶」：spacer 高度（用户消息钉在顶部，助手在下方填充，两者都在视野内） */
  const [spacerHeight, setSpacerHeight] = useState(0);
  const pinningRef = useRef(false);
  const requestStartedAtRef = useRef<number | null>(null);
  // 刚由本页创建的会话：跳过一次历史加载（否则会把刚发出的消息清空）
  const skipHistoryForRef = useRef<string | null>(null);
  /** 当前聊天流是为哪个会话开的（挂起在提问上时，用来判断这条流属不属于它） */
  const streamTopicIdRef = useRef<string | null>(null);
  /** 隐藏的选文件 input（附件按钮点它） */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 待发送附件（已上传到 /uploads，随消息一起发） */
  const attachments = useAttachments();

  /**
   * 拉会话列表。**默认静默**：发送消息 / 改名 / 删除之后的刷新不闪骨架屏；
   * 只有首次加载（挂载时）传 `{ silent: false }` 才显示骨架 + 错误态。
   */
  const refreshTopics = useCallback(async ({ silent = true }: { silent?: boolean } = {}) => {
    if (!silent) setTopicsStatus('loading');
    try {
      const res = await fetch('/api/topics');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { topics?: Topic[] };
      setTopics(data.topics ?? []);
      setTopicsStatus('ready');
    } catch {
      // 静默刷新失败不打扰：保留现有列表
      if (!silent) setTopicsStatus('error');
    }
  }, []);

  const refreshAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = (await res.json()) as { agents?: Agent[] };
      setAgents(data.agents ?? []);
    } catch {
      /* 忽略 */
    }
  }, []);

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    clearError,
    regenerate,
    setMessages,
  } = useChat({
    onFinish: () => void refreshTopics(),
  });

  // 跨会话提示：每 3s 轮询服务端注册表（哪些会话在等待回答）
  const pendingRuns = usePendingRuns();
  const pendingTopicIds = useMemo(
    () => new Set(pendingRuns.map((item) => item.topicId).filter(Boolean) as string[]),
    [pendingRuns],
  );
  /** 其它会话的 pending（当前会话的走 QuestionBar） */
  const otherTopicPendings = useMemo(
    () => pendingRuns.filter((item) => item.topicId && item.topicId !== activeTopicId),
    [pendingRuns, activeTopicId],
  );
  /** 当前会话的 pending：消息里的标记（实时）+ 注册表（切走再切回/刷新后消息标记会丢） */
  const pendingQuestions = useMemo(
    () =>
      mergePendingQuestions(
        findPendingQuestions(messages),
        pendingRuns.filter((item) => item.topicId === activeTopicId),
      ),
    [messages, pendingRuns, activeTopicId],
  );

  // 挂起流：当前聊天流的会话有等待回答的提问时（pi 阻塞在提问、不产生数据），
  // 这条流是"空闲挂起"的——不算忙碌，否则切到其它会话也会显示"停止/思考中"、发不出消息
  const streamBlocked =
    status === 'streaming' &&
    streamTopicIdRef.current != null &&
    pendingRuns.some((item) => item.topicId === streamTopicIdRef.current);
  const busy = status === 'submitted' || (status === 'streaming' && !streamBlocked);

  const lastMessage = messages[messages.length - 1];
  // 有待回答的提问时禁用输入框（避免并发发消息）
  const hasPendingQuestion = pendingQuestions.length > 0;
  const waitingFirstToken =
    busy &&
    !(
      lastMessage?.role === 'assistant' &&
      lastMessage.parts.some(
        (part) =>
          (part.type === 'text' || part.type === 'reasoning') && part.text.trim().length > 0,
      )
    );
  // 流式文案：正在调工具 / 正在思考（对标 LobeHub 的操作感知文案）
  const streamingTool =
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some(
      (part) =>
        isToolUIPart(part) && (part.state === 'input-available' || part.state === 'input-streaming'),
    );
  const streamLabel = streamingTool ? '正在调用工具' : '正在思考';

  // 当前会话是不是 pi（RPC）主题：是的话历史归 pi 管、分支走会话树面板、消息动作里隐藏「分支」
  const activeAgent = useMemo(
    () => agents.find((item) => item.id === activeAgentId) ?? null,
    [agents, activeAgentId],
  );
  const isPiTopic =
    activeAgent?.runtime === 'cli' &&
    isPiCommand(activeAgent.cliCommand) &&
    isPiRpcCommand(activeAgent.cliCommand);

  /** 从会话树选了分支点：切到该分支（重载对话），把那句话放回输入框，编辑后发送即开新分支。 */
  const handleBranchFromTree = useCallback((text: string) => {
    setDraft(text);
    // pi 主题的对话按当前分支渲染：导航后重载一次，消息列表就切到新分支
    setHistoryAttempt((count) => count + 1);
    toast.success('已切到该分支点，编辑后发送即开新分支');
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
    );
  }, []);

  // 启动：拉会话列表 + Agent 列表 + 从 URL 恢复当前会话（刷新后仍停在同一个会话）
  useEffect(() => {
    void refreshTopics({ silent: false });
    void refreshAgents();
    // 空闲时预取「管理 Agent」页（参考 refs 的意图预取：点过去更快）
    router.prefetch('/agents');
    router.prefetch('/skills');
    router.prefetch('/mcp');
    const id = new URLSearchParams(window.location.search).get('topic');
    if (id) setActiveTopicId(id);
  }, [refreshAgents, refreshTopics, router]);

  // 当前会话使用哪个 Agent / 哪些工具（由会话记录决定；新建会话时用选择器里的值）
  useEffect(() => {
    if (!activeTopicId) return;
    const topic = topics.find((item) => item.id === activeTopicId);
    if (topic) {
      setActiveAgentId(topic.agentId ?? null);
      setToolSettings(parseToolSettings(topic.tools) ?? []);
      setTopicEffort(topic.reasoningEffort ?? '');
    }
  }, [activeTopicId, topics]);

  /** 工具开关：已有会话落库；新会话先记在本地，建会话时带上。 */
  const handleToolChange = useCallback(
    async (next: ToolSetting[]) => {
      setToolSettings(next);
      if (activeTopicId) {
        await fetch(`/api/topics/${activeTopicId}`, {
          body: JSON.stringify({ tools: next }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        });
      }
    },
    [activeTopicId],
  );

  /** 思考等级：已有会话落库（会话级覆盖），新会话先记在本地。 */
  const handleEffortChange = useCallback(
    async (next: string) => {
      setTopicEffort(next);
      if (activeTopicId) {
        await fetch(`/api/topics/${activeTopicId}`, {
          body: JSON.stringify({ reasoningEffort: next || null }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        });
        void refreshTopics();
      }
    },
    [activeTopicId, refreshTopics],
  );

  /** 切换 Agent：已有会话则落库（换人设立即生效），否则记在本地等建会话时带上。 */
  const handleAgentChange = useCallback(
    async (agentId: string) => {
      setSidebarOpen(false);
      const next = agentId || null;
      setActiveAgentId(next);
      if (activeTopicId) {
        await fetch(`/api/topics/${activeTopicId}`, {
          body: JSON.stringify({ agentId: next }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        });
        void refreshTopics();
      }
    },
    [activeTopicId, refreshTopics],
  );

  // 当前会话写回 URL
  useEffect(() => {
    window.history.replaceState(null, '', activeTopicId ? `/chat?topic=${activeTopicId}` : '/chat');
  }, [activeTopicId]);

  // 切换会话：加载历史消息
  useEffect(() => {
    if (!activeTopicId) {
      setMessages([]);
      return;
    }
    if (skipHistoryForRef.current === activeTopicId) {
      skipHistoryForRef.current = null;
      return;
    }

    let cancelled = false;
    setHistoryStatus('loading');
    fetch(`/api/topics/${activeTopicId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { messages?: ChatMessage[] }) => {
        if (cancelled) return;
        const history: UIMessage[] = (data.messages ?? []).map((row) => {
          // 优先用入库的完整片段（含工具调用与交错顺序）；老数据回落到 content + reasoning
          const stored = parseStoredParts(row.parts);
          const parts: UIMessage['parts'] = stored
            ? deserializeParts(stored)
            : [
                ...(row.reasoning ? [{ text: row.reasoning, type: 'reasoning' as const }] : []),
                ...(row.content ? [{ text: row.content, type: 'text' as const }] : []),
              ];
          return {
            id: row.id,
            metadata: {
              createdAt: new Date(row.createdAt).getTime(),
              ...(row.reasoningMs ? { reasoningMs: row.reasoningMs } : {}),
            },
            parts,
            role: row.role,
          };
        });
        setMessages(history);
        atBottomRef.current = true;
        setAtBottom(true);
        setHistoryStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setHistoryStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [activeTopicId, historyAttempt, setMessages]);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ behavior: smooth ? 'smooth' : 'auto', top: el.scrollHeight });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    atBottomRef.current = near;
    setAtBottom(near);
    // 用户往上翻 → 取消「钉顶」（去掉 spacer，回到普通滚动）
    if (!near && pinningRef.current) {
      pinningRef.current = false;
      setSpacerHeight(0);
    }
  }, []);

  // 新内容到达时：只有用户本来就在底部才跟随（上翻阅读时不被打断）
  // 另外：发送后处于「钉顶」状态时，按视口算出底部 spacer，让用户消息停在顶部、助手在下方填充
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinningRef.current) {
      const users = el.querySelectorAll<HTMLElement>('[data-role="user"]');
      const lastUser = users[users.length - 1];
      const rest = [...el.children].filter(
        (child) => child.getAttribute('aria-hidden') !== 'true',
      ) as HTMLElement[];
      const last = rest[rest.length - 1];
      if (lastUser && last) {
        // 从"最后一条用户消息"顶部到"最后一条消息"底部的整段高度（不含 spacer）
        const below =
          last.getBoundingClientRect().bottom - lastUser.getBoundingClientRect().top;
        setSpacerHeight(Math.max(0, el.clientHeight - below - 32));
      }
    }
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;

    let topicId = activeTopicId;

    // 新会话：先建 topic（标题取首条消息），再带着 topicId 发消息
    if (!topicId) {
      try {
        const res = await fetch('/api/topics', {
          body: JSON.stringify({
            agentId: activeAgentId ?? undefined,
            reasoningEffort: topicEffort || undefined,
            title: text.slice(0, 40),
            tools: toolSettings,
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        });
        const data = (await res.json()) as { topic?: Topic };
        topicId = data.topic?.id ?? null;
        if (topicId) {
          skipHistoryForRef.current = topicId;
          setActiveTopicId(topicId);
          void refreshTopics();
        }
      } catch {
        /* 建会话失败也要能聊（只是不落库） */
      }
    }

    setDraft('');
    atBottomRef.current = true;
    setAtBottom(true);
    pinningRef.current = true;
    requestStartedAtRef.current = Date.now();
    streamTopicIdRef.current = topicId;
    // 附件随消息一起发：消息里落 file 片段（URL 形态），发模型前才转 base64/image part
    // 只带 status==='done' 且有 url 的（上传中/失败的先不发，发送按钮本来就禁用）
    const files = attachments.items
      .filter((item) => item.status === 'done' && item.url)
      .map((item) => ({
        filename: item.filename,
        mediaType: item.mediaType,
        type: 'file' as const,
        url: item.url as string,
      }));
    attachments.clear();
    void sendMessage(
      { files, text },
      {
        body: {
          agentId: activeAgentId ?? undefined,
          tools: toolSettings,
          topicId: topicId ?? undefined,
        },
      },
    );
    requestAnimationFrame(() => scrollToBottom(false));
  }, [
    activeAgentId,
    activeTopicId,
    attachments,
    draft,
    refreshTopics,
    scrollToBottom,
    sendMessage,
    toolSettings,
  ]);

  /** 消息操作：复制 / 放回输入框 / 重新生成 / 删除。 */
  const handleMessageAction = useCallback(
    async (message: UIMessage, key: MessageActionKey) => {
      const text = message.parts
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('');

      switch (key) {
        case 'copy': {
          await copyToClipboard(text);
          toast.success('已复制到剪贴板');
          break;
        }
        case 'restore': {
          // 附件一起放回（URL 直接复用，不重传——对应 LobeChat 的 skipRemoveFile 思路）
          const files = message.parts
            .filter((part): part is Extract<UIMessage['parts'][number], { type: 'file' }> => part.type === 'file')
            .map((part) => ({
              filename: part.filename ?? '附件',
              mediaType: part.mediaType,
              url: part.url,
            }));
          if (files.length > 0) attachments.addExisting(files);
          setDraft(text);
          if (files.length > 0) {
            toast.success(`已放回输入框（附件 ${files.length} 个，无需重新上传）`);
          }
          requestAnimationFrame(() =>
            document.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
          );
          break;
        }
        case 'regenerate': {
          // 先删库里的旧回复再重新生成，避免刷新后新旧两条都在（必须等删除完成）
          await fetch(`/api/messages/${message.id}`, { method: 'DELETE' });
          requestStartedAtRef.current = Date.now();
          try {
            await regenerate({
              body: activeTopicId ? { topicId: activeTopicId } : undefined,
              messageId: message.id,
            });
          } catch {
            // 消息可能已不存在（另一个标签页删过 / 本地状态过期）——别抛未处理异常，重新拉一次历史
            toast.error('这条消息已不存在，已重新加载会话');
            setHistoryAttempt((count) => count + 1);
          }
          break;
        }
        case 'branch': {
          if (!activeTopicId) break;
          try {
            const res = await fetch(`/api/topics/${activeTopicId}/branch`, {
              body: JSON.stringify({ messageId: message.id }),
              headers: { 'content-type': 'application/json' },
              method: 'POST',
            });
            const data = (await res.json()) as { topic?: Topic };
            if (data.topic?.id) {
              await refreshTopics();
              // 切到分支会话（会触发历史加载）
              setActiveTopicId(data.topic.id);
              toast.success('已创建分支会话');
            } else {
              toast.error('创建分支失败');
            }
          } catch {
            toast.error('创建分支失败');
          }
          break;
        }
        case 'delete': {
          await fetch(`/api/messages/${message.id}`, { method: 'DELETE' });
          setMessages((prev) => prev.filter((item) => item.id !== message.id));
          void refreshTopics();
          break;
        }
      }
    },
    [activeTopicId, attachments, refreshTopics, regenerate, setMessages],
  );

  const handleRetry = useCallback(async () => {
    clearError();
    requestStartedAtRef.current = Date.now();
    try {
      await regenerate({ body: activeTopicId ? { topicId: activeTopicId } : undefined });
    } catch {
      // 同上：消息可能已被删除，别抛未处理异常
      toast.error('这条消息已不存在，已重新加载会话');
      setHistoryAttempt((count) => count + 1);
    }
  }, [activeTopicId, clearError, regenerate]);

  /** 历史消息加载失败后的重试 */
  const retryHistory = useCallback(() => {
    setHistoryStatus('loading');
    setHistoryAttempt((count) => count + 1);
  }, []);

  // 切会话时是否保留当前聊天流：有等待回答的提问（消息标记或注册表任一命中）时必须保留——
  // 此时流是空闲挂起的（pi 阻塞在等回答，不产生数据，不会污染目标会话的视图），
  // 而 stop() 会 abort 请求 → 服务端 signal 把 pi 进程杀掉，回答就无处可送了（跨会话 island 靠这条活）。
  const keepStream = hasPendingQuestion || pendingRuns.length > 0;

  const handleCreate = useCallback(() => {
    if (!keepStream) stop();
    clearError();
    setSidebarOpen(false);
    setActiveTopicId(null);
    setMessages([]);
    attachments.clear();
    pinningRef.current = false;
    setSpacerHeight(0);
  }, [attachments, clearError, keepStream, setMessages, stop]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeTopicId) return;
      if (!keepStream) stop();
      clearError();
      setSidebarOpen(false);
      attachments.clear();
      setActiveTopicId(id);
      pinningRef.current = false;
      setSpacerHeight(0);
    },
    [activeTopicId, attachments, clearError, keepStream, stop],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await fetch(`/api/topics/${id}`, { method: 'DELETE' });
      if (id === activeTopicId) {
        setActiveTopicId(null);
        setMessages([]);
      }
      void refreshTopics();
    },
    [activeTopicId, refreshTopics, setMessages],
  );

  const handleRename = useCallback(
    async (id: string, title: string) => {
      await fetch(`/api/topics/${id}`, {
        body: JSON.stringify({ title }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      void refreshTopics();
    },
    [refreshTopics],
  );

  return (
    <div style={{ display: 'flex', height: '100dvh' }}>
      {isMobile ? (
        <>
          {sidebarOpen && (
            <div
              aria-hidden
              className="hearth-backdrop"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <div className="hearth-drawer" data-open={sidebarOpen} inert={!sidebarOpen}>
            <TopicSidebar
              activeAgentId={activeAgentId}
              activeId={activeTopicId}
              agents={agents}
              topics={topics}
              width="min(82vw, 300px)"
              onAgentChange={(id) => void handleAgentChange(id)}
              onCreate={handleCreate}
              onDelete={(id) => void handleDelete(id)}
              onManageAgents={() => {
                setSidebarOpen(false);
                router.push('/agents');
              }}
              onManageSkills={() => {
                setSidebarOpen(false);
                router.push('/skills');
              }}
              onManageMcp={() => {
                setSidebarOpen(false);
                router.push('/mcp');
              }}
              onRename={(id, title) => void handleRename(id, title)}
              onRetryTopics={() => void refreshTopics({ silent: false })}
              onSelect={handleSelect}
              pendingTopicIds={pendingTopicIds}
              topicsError={topicsStatus === 'error'}
              topicsLoading={topicsStatus === 'loading'}
            />
          </div>
        </>
      ) : (
        <TopicSidebar
          activeAgentId={activeAgentId}
          activeId={activeTopicId}
          agents={agents}
          topics={topics}
          onAgentChange={(id) => void handleAgentChange(id)}
          onCreate={handleCreate}
          onDelete={(id) => void handleDelete(id)}
          onManageAgents={() => router.push('/agents')}
          onManageSkills={() => router.push('/skills')}
          onManageMcp={() => router.push('/mcp')}
          onRename={(id, title) => void handleRename(id, title)}
          onRetryTopics={() => void refreshTopics({ silent: false })}
          onSelect={handleSelect}
          pendingTopicIds={pendingTopicIds}
          topicsError={topicsStatus === 'error'}
          topicsLoading={topicsStatus === 'loading'}
        />
      )}

      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
        {/* 顶栏：主题控件在这里（不悬浮、不遮挡内容）；手机上左侧是抽屉开关。 */}
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
            display: 'flex',
            flexShrink: 0,
            gap: 8,
            justifyContent: 'space-between',
            padding: '8px 12px',
            paddingTop: 'max(8px, env(safe-area-inset-top))',
          }}
        >
          {isMobile && (
            <Button
              aria-label="打开会话列表"
              icon={<Icon icon={PanelLeft} size={18} />}
              size="large"
              type="text"
              onClick={() => setSidebarOpen(true)}
            />
          )}
          <Text style={{ flex: isMobile ? 1 : undefined, fontSize: 16, fontWeight: 600 }}>
            Hearth
          </Text>
          <ThemeControls />
        </div>

        {/* 消息区：relative 容器承载"回到最新"按钮 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <div
            className="hearth-scroll"
            ref={scrollRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              height: '100%',
              overflowY: 'auto',
              padding: 16,
            }}
            onScroll={handleScroll}
          >
            {historyStatus === 'loading' ? (
              <MessageSkeleton />
            ) : historyStatus === 'error' && messages.length === 0 ? (
              <Flexbox align="center" gap={10} style={{ padding: 32 }}>
                <Text type="danger">历史消息加载失败，请检查网络后重试</Text>
                <Button size="small" onClick={retryHistory}>
                  重试
                </Button>
              </Flexbox>
            ) : messages.length === 0 && !busy ? (
              <EmptyState />
            ) : (
              messages.map((message, index) => (
                <MessageItem
                  assistantAvatar={activeAgent?.avatar}
                  assistantBackground={activeAgent?.backgroundColor}
                  assistantName={activeAgent?.name ?? '默认 Agent'}
                  busy={busy}
                  canBranch={!isPiTopic}
                  key={message.id}
                  message={message}
                  onAction={(target, key) => void handleMessageAction(target, key)}
                  startedAt={
                    message.role === 'assistant' && index === messages.length - 1
                      ? (requestStartedAtRef.current ?? undefined)
                      : undefined
                  }
                />
              ))
            )}
            {waitingFirstToken && (
              <StreamingIndicator
                label={streamLabel}
                startedAt={requestStartedAtRef.current ?? undefined}
              />
            )}
            {/* 发送后「钉顶」的底部占位（学 LobeHub 的 spacer）：用户消息停在顶部、助手在下方填充 */}
            {spacerHeight > 0 && (
              <div aria-hidden style={{ flexShrink: 0, height: spacerHeight }} />
            )}
          </div>

          <BackBottom visible={!atBottom} onClick={() => scrollToBottom(true)} />
        </div>

        {error && (
          <div
            style={{
              alignItems: 'center',
              background: 'var(--ant-color-error-bg, rgba(255, 77, 79, 0.12))',
              borderRadius: 8,
              color: 'var(--ant-color-error, #ff4d4f)',
              display: 'flex',
              fontSize: 13,
              gap: 12,
              justifyContent: 'space-between',
              margin: '0 12px 4px',
              padding: '8px 12px',
            }}
          >
            <span>{error.message}</span>
            <span style={{ display: 'flex', flexShrink: 0, gap: 8 }}>
              {messages.length > 0 && (
                <Button size="small" onClick={() => void handleRetry()}>
                  重试
                </Button>
              )}
              <Button size="small" onClick={clearError}>
                知道了
              </Button>
            </span>
          </div>
        )}

        {/* 任务清单面板（pi 的 todo 扩展；没有清单时自动隐藏） */}
        <TodoPanel messages={messages} />

        {/* 跨会话提示条（其它会话有等待回答的提问时出现，点行跳过去回答） */}
        <PendingIsland onSelect={handleSelect} pendings={otherTopicPendings} topics={topics} />

        {/* 提问栏（等待回答时出现；回答在这里完成，消息里只留结果） */}
        <QuestionBar pendings={pendingQuestions} />

        <ChatComposer
          attachButton={
            <Button
              disabled={hasPendingQuestion}
              icon={Paperclip}
              onClick={() => fileInputRef.current?.click()}
              size="small"
              title="添加图片（也可以拖进来或直接粘贴）"
              type="text"
            />
          }
          attachmentSlot={
            attachments.items.length > 0 || attachments.uploadingCount > 0 ? (
              <>
                <AttachmentPreview
                  items={attachments.items}
                  onRemove={attachments.remove}
                  onRetry={attachments.retry}
                />
                {attachments.error && (
                  <Text style={{ color: 'var(--ant-color-error, #ff4d4f)', fontSize: 12 }} type="secondary">
                    {attachments.error}
                  </Text>
                )}
              </>
            ) : null
          }
          busy={busy}
          disabled={hasPendingQuestion || attachments.uploadingCount > 0}
          onFiles={(files) => void attachments.addFiles(files)}
          toolPicker={
            <ToolPicker
              agentId={activeAgentId}
              settings={toolSettings}
              onChange={(next) => void handleToolChange(next)}
            />
          }
          effortPicker={
            <EffortPicker
              agentId={activeAgentId}
              onChange={(next) => void handleEffortChange(next)}
              value={topicEffort}
            />
          }
          sessionTree={
            activeTopicId && isPiTopic ? (
              <SessionTree
                refreshKey={messages.length}
                topicId={activeTopicId}
                onBranch={handleBranchFromTree}
              />
            ) : null
          }
          contextMeter={<ContextMeter refreshKey={messages.length} topicId={activeTopicId} />}
          value={draft}
          onChange={setDraft}
          onSend={() => void handleSend()}
          onStop={stop}
        />
        {/* 选文件入口（隐藏 input；附件按钮/拖拽/粘贴都汇到 attachments.addFiles） */}
        <input
          accept={FILE_ACCEPT}
          multiple
          ref={fileInputRef}
          style={{ display: 'none' }}
          type="file"
          onChange={(event) => {
            if (event.target.files?.length) void attachments.addFiles(event.target.files);
            // 清空：否则连续选同一个文件不会再触发 change
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
