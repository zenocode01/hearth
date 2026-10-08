'use client';

import { useChat } from '@ai-sdk/react';
import { Button, Flexbox, Icon, Text, copyToClipboard } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { ThinkIcon } from '@lobehub/ui/icons';
import type { UIMessage } from 'ai';
import { PanelLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ThemeControls } from '@/components/ThemeControls';
import { useIsMobile } from '@/components/useMediaQuery';
import type { Agent, ChatMessage, Topic } from '@/lib/db/schema';

import { BackBottom } from './BackBottom';
import { ChatComposer } from './ChatComposer';
import { EmptyState } from './EmptyState';
import { MessageItem } from './MessageItem';
import type { MessageActionKey } from './MessageActions';
import { MessageSkeleton } from './MessageSkeleton';
import { TopicSidebar } from './TopicSidebar';

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
  /** 手机端：侧栏抽屉是否打开 */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isMobile = useIsMobile();
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const requestStartedAtRef = useRef<number | null>(null);
  // 刚由本页创建的会话：跳过一次历史加载（否则会把刚发出的消息清空）
  const skipHistoryForRef = useRef<string | null>(null);

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

  const busy = status === 'submitted' || status === 'streaming';

  const lastMessage = messages[messages.length - 1];
  const waitingFirstToken =
    busy &&
    !(
      lastMessage?.role === 'assistant' &&
      lastMessage.parts.some(
        (part) =>
          (part.type === 'text' || part.type === 'reasoning') && part.text.trim().length > 0,
      )
    );

  // 启动：拉会话列表 + Agent 列表 + 从 URL 恢复当前会话（刷新后仍停在同一个会话）
  useEffect(() => {
    void refreshTopics({ silent: false });
    void refreshAgents();
    // 空闲时预取「管理 Agent」页（参考 refs 的意图预取：点过去更快）
    router.prefetch('/agents');
    const id = new URLSearchParams(window.location.search).get('topic');
    if (id) setActiveTopicId(id);
  }, [refreshAgents, refreshTopics, router]);

  // 当前会话使用哪个 Agent（由会话记录决定；新建会话时用选择器里的值）
  useEffect(() => {
    if (!activeTopicId) return;
    const topic = topics.find((item) => item.id === activeTopicId);
    if (topic) setActiveAgentId(topic.agentId ?? null);
  }, [activeTopicId, topics]);

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
          const parts: UIMessage['parts'] = [];
          // 推理过程存在时放在正文之前（与实时渲染的结构一致）
          if (row.reasoning) parts.push({ text: row.reasoning, type: 'reasoning' });
          if (row.content) parts.push({ text: row.content, type: 'text' });
          return {
            id: row.id,
            metadata: row.reasoningMs ? { reasoningMs: row.reasoningMs } : undefined,
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
  }, []);

  // 新内容到达时：只有用户本来就在底部才跟随（上翻阅读时不被打断）
  useEffect(() => {
    if (atBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;

    let topicId = activeTopicId;

    // 新会话：先建 topic（标题取首条消息），再带着 topicId 发消息
    if (!topicId) {
      try {
        const res = await fetch('/api/topics', {
          body: JSON.stringify({ agentId: activeAgentId ?? undefined, title: text.slice(0, 40) }),
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
    requestStartedAtRef.current = Date.now();
    void sendMessage(
      { text },
      { body: { agentId: activeAgentId ?? undefined, topicId: topicId ?? undefined } },
    );
    requestAnimationFrame(() => scrollToBottom(false));
  }, [activeAgentId, activeTopicId, draft, refreshTopics, scrollToBottom, sendMessage]);

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
          setDraft(text);
          requestAnimationFrame(() =>
            document.querySelector<HTMLTextAreaElement>('textarea')?.focus(),
          );
          break;
        }
        case 'regenerate': {
          // 先删库里的旧回复再重新生成，避免刷新后新旧两条都在（必须等删除完成）
          await fetch(`/api/messages/${message.id}`, { method: 'DELETE' });
          requestStartedAtRef.current = Date.now();
          void regenerate({
            body: activeTopicId ? { topicId: activeTopicId } : undefined,
            messageId: message.id,
          });
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
    [activeTopicId, refreshTopics, regenerate, setMessages],
  );

  const handleRetry = useCallback(() => {
    clearError();
    requestStartedAtRef.current = Date.now();
    void regenerate({ body: activeTopicId ? { topicId: activeTopicId } : undefined });
  }, [activeTopicId, clearError, regenerate]);

  /** 历史消息加载失败后的重试 */
  const retryHistory = useCallback(() => {
    setHistoryStatus('loading');
    setHistoryAttempt((count) => count + 1);
  }, []);

  const handleCreate = useCallback(() => {
    stop();
    clearError();
    setSidebarOpen(false);
    setActiveTopicId(null);
    setMessages([]);
  }, [clearError, setMessages, stop]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeTopicId) return;
      stop();
      clearError();
      setSidebarOpen(false);
      setActiveTopicId(id);
    },
    [activeTopicId, clearError, stop],
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
              onRename={(id, title) => void handleRename(id, title)}
              onRetryTopics={() => void refreshTopics({ silent: false })}
              onSelect={handleSelect}
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
          onRename={(id, title) => void handleRename(id, title)}
          onRetryTopics={() => void refreshTopics({ silent: false })}
          onSelect={handleSelect}
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
                  busy={busy}
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
              <span
                className="hearth-thinking"
                style={{
                  alignItems: 'center',
                  color: 'var(--ant-color-text-secondary, rgba(0, 0, 0, 0.45))',
                  display: 'inline-flex',
                  gap: 6,
                }}
              >
                <Icon icon={ThinkIcon} size={14} />
                模型思考中…
              </span>
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
                <Button size="small" onClick={handleRetry}>
                  重试
                </Button>
              )}
              <Button size="small" onClick={clearError}>
                知道了
              </Button>
            </span>
          </div>
        )}

        <ChatComposer
          busy={busy}
          value={draft}
          onChange={setDraft}
          onSend={() => void handleSend()}
          onStop={stop}
        />
      </div>
    </div>
  );
}
