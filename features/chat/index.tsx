'use client';

import { useChat } from '@ai-sdk/react';
import { Button, Flexbox, Icon, Text, copyToClipboard } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { isToolUIPart, type UIMessage } from 'ai';
import { Dropdown } from 'antd';
import { MoreHorizontal, PanelLeft, Paperclip } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ThemeControls } from '@/components/ThemeControls';
import { useConfirmDelete } from '@/components/confirmDialog';
import { usePromptDialog } from '@/components/promptDialog';
import { useIsMobile } from '@/components/useMediaQuery';
import { parseStoredParts, deserializeParts } from '@/lib/db/messageParts';
import type { Agent, ChatMessage, Topic } from '@/lib/db/schema';
import { FILE_ACCEPT } from '@/lib/files/constants';
import { exportFilename } from '@/lib/export/topicExport';
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
import { MessageActionProvider } from './MessageActionProvider';
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
  /** 正在编辑的消息 id（null = 没在编辑） */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 当前草稿属于哪个会话（'new' = 还没建会话）；切会话时防串味 */
  const draftTopicRef = useRef<string | null>(null);

  // 草稿持久化（对标 LobeHub 的 useChatInputDraft）：按会话存 localStorage，刷新/切走再回来都不丢。
  // 保存 effect 声明在载入 effect **之前**：切会话时保存先跑、此时 ref 还是旧会话 → 跳过，
  // 避免把旧会话的草稿写进新会话。
  useEffect(() => {
    const key = activeTopicId ?? 'new';
    if (draftTopicRef.current !== key) return;
    try {
      localStorage.setItem(`hearth-draft:${key}`, draft);
    } catch {
      /* 隐私模式忽略 */
    }
  }, [activeTopicId, draft]);

  useEffect(() => {
    const key = activeTopicId ?? 'new';
    draftTopicRef.current = key;
    try {
      setDraft(localStorage.getItem(`hearth-draft:${key}`) ?? '');
    } catch {
      setDraft('');
    }
  }, [activeTopicId]);
  /** 本会话的工具开关（[] = 全部自动启用） */
  const [toolSettings, setToolSettings] = useState<ToolSetting[]>([]);
  /** 本会话的思考等级覆盖（'' = 跟随 Agent） */
  const [topicEffort, setTopicEffort] = useState('');
  /** 手机端：侧栏抽屉是否打开 */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isMobile = useIsMobile();
  const router = useRouter();
  // 删除确认对话框（声明式、自包含；见 components/confirmDialog.tsx）
  const { modal: deleteModal, open: openDeleteConfirm } = useConfirmDelete();
  // 页头「⋯」菜单用的两个对话框
  const topicDelete = useConfirmDelete();
  const renameDialog = usePromptDialog();

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
  // 输入历史（↑/↓ 翻）：本会话已发过的用户消息文本
  const inputHistory = useMemo(
    () =>
      messages
        .filter((item) => item.role === 'user')
        .map((item) =>
          item.parts.map((part) => (part.type === 'text' ? part.text : '')).join('').trim(),
        )
        .filter(Boolean),
    [messages],
  );
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
  /** 当前会话标题（页头显示） */
  const activeTopicTitle = useMemo(
    () => topics.find((item) => item.id === activeTopicId)?.title ?? null,
    [topics, activeTopicId],
  );

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
          const createdAtMs = row.createdAt ? new Date(row.createdAt).getTime() : Number.NaN;
          return {
            id: row.id,
            metadata: {
              ...(Number.isFinite(createdAtMs) ? { createdAt: createdAtMs } : {}),
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
        case 'edit': {
          setEditingId(message.id);
          break;
        }
        case 'delete': {
          openDeleteConfirm({
            content: '删除后无法恢复。',
            onOk: async () => {
              await fetch(`/api/messages/${message.id}`, { method: 'DELETE' });
              setMessages((prev) => prev.filter((item) => item.id !== message.id));
              void refreshTopics();
            },
            title: '删除这条消息？',
          });
          break;
        }
      }
    },
    [activeTopicId, attachments, openDeleteConfirm, refreshTopics, regenerate, setMessages],
  );

  /** 提交编辑：改本地 + 落库；若改的是最后一条用户消息，删掉其回复并重跑（对标 LobeHub 的"编辑并重发"）。 */
  const handleEditSubmit = useCallback(
    async (id: string, nextText: string) => {
      setEditingId(null);
      const trimmed = nextText.trim();
      if (!trimmed) return;

      setMessages((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const files = item.parts.filter((part) => part.type === 'file');
          return { ...item, parts: [{ text: trimmed, type: 'text' as const }, ...files] };
        }),
      );
      try {
        await fetch(`/api/messages/${id}`, {
          body: JSON.stringify({ content: trimmed }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        });
      } catch {
        toast.error('保存失败');
      }

      // 是最后一条用户消息 → 删掉其后的助手回复并重跑
      const lastUser = [...messages].reverse().find((item) => item.role === 'user');
      if (lastUser?.id !== id) return;
      const userIndex = messages.findIndex((item) => item.id === id);
      const reply = messages.slice(userIndex + 1).find((item) => item.role === 'assistant');
      if (!reply) return;
      await fetch(`/api/messages/${reply.id}`, { method: 'DELETE' });
      requestStartedAtRef.current = Date.now();
      try {
        await regenerate({
          body: activeTopicId ? { topicId: activeTopicId } : undefined,
          messageId: reply.id,
        });
      } catch {
        toast.error('重跑失败，可点「重新生成」');
      }
    },
    [activeTopicId, messages, regenerate, setMessages],
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

  /** 斜杠命令（对标 LobeHub）：/new 新建对话、/compact 压缩当前会话 */
  const slashCommands = useMemo(
    () => [
      { description: '新建对话', name: 'new' },
      { description: '压缩当前会话上下文', name: 'compact' },
    ],
    [],
  );

  const handleCommand = useCallback(
    (name: string) => {
      if (name === 'new') {
        handleCreate();
        return;
      }
      if (name === 'compact') {
        if (!activeTopicId) {
          toast.info('先在当前会话里聊几句，再压缩');
          return;
        }
        void fetch(`/api/topics/${activeTopicId}/context`, { method: 'POST' })
          .then(async (res) => {
            const data = (await res.json()) as {
              compacted?: boolean;
              error?: string;
              reason?: string;
            };
            if (!res.ok) toast.error(data.error ?? '压缩失败');
            else if (data.compacted) toast.success('已压缩上下文');
            else toast.info(data.reason ?? '没有需要压缩的内容');
          })
          .catch(() => toast.error('压缩请求失败'));
      }
    },
    [activeTopicId, handleCreate],
  );

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

  /** 导出当前会话（拉内容 → 触发下载；与侧栏那套一致） */
  const handleExport = useCallback(
    async (format: 'json' | 'md') => {
      if (!activeTopicId) return;
      try {
        const res = await fetch(`/api/topics/${activeTopicId}/export?format=${format}`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = exportFilename(activeTopicTitle ?? 'conversation', format);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        toast.success(`已导出 ${format === 'json' ? 'JSON' : 'Markdown'}`);
      } catch {
        toast.error('导出失败，请重试');
      }
    },
    [activeTopicId, activeTopicTitle],
  );

  /** 页头「⋯」菜单（对标 LobeHub 的话题操作菜单） */
  const headerMenu = useMemo(
    () => ({
      items: [
        { key: 'rename', label: '重命名' },
        { key: 'export-md', label: '导出 Markdown' },
        { key: 'export-json', label: '导出 JSON' },
        { type: 'divider' as const },
        { danger: true, key: 'delete', label: '删除会话' },
      ],
      onClick: ({ key }: { key: string }) => {
        if (key === 'rename') {
          if (!activeTopicId) return;
          renameDialog.open({
            defaultValue: activeTopicTitle ?? '',
            onSubmit: (value) => handleRename(activeTopicId, value),
            placeholder: '会话标题',
            title: '重命名会话',
          });
        } else if (key === 'export-md') {
          void handleExport('md');
        } else if (key === 'export-json') {
          void handleExport('json');
        } else if (key === 'delete') {
          if (!activeTopicId) return;
          topicDelete.open({
            content: '删除后无法恢复，会话中的消息会一起删除。',
            onOk: () => handleDelete(activeTopicId),
            title: `删除会话「${activeTopicTitle ?? ''}」？`,
          });
        }
      },
    }),
    [
      activeTopicId,
      activeTopicTitle,
      handleDelete,
      handleExport,
      handleRename,
      renameDialog.open,
      topicDelete.open,
    ],
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
          <Text
            ellipsis
            style={{ flex: 1, fontSize: 16, fontWeight: 600 }}
            title={activeTopicTitle ?? undefined}
          >
            {activeTopicTitle ?? 'Hearth'}
          </Text>
          {activeTopicId && (
            <Dropdown menu={headerMenu} trigger={['click']}>
              <Button
                aria-label="会话操作"
                icon={<Icon icon={MoreHorizontal} size={18} />}
                type="text"
              />
            </Dropdown>
          )}
          <ThemeControls />
        </div>

        {/* 消息区：relative 容器承载"回到最新"按钮 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <MessageActionProvider>
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
                  canEdit={!isPiTopic}
                  editing={editingId === message.id}
                  key={message.id}
                  message={message}
                  onAction={(target, key) => void handleMessageAction(target, key)}
                  onEditCancel={() => setEditingId(null)}
                  onEditSubmit={(id, text) => void handleEditSubmit(id, text)}
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
          </MessageActionProvider>

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
          commands={slashCommands}
          history={inputHistory}
          onCommand={handleCommand}
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

        {/* 删除消息的确认对话框（声明式、自包含） */}
        {deleteModal}
        {/* 页头菜单用的重命名 / 删除会话对话框 */}
        {renameDialog.modal}
        {topicDelete.modal}
      </div>
    </div>
  );
}
