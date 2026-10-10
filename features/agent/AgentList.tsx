'use client';

import { Button, Center, Flexbox, FluentEmoji, Icon, Text, Tooltip } from '@lobehub/ui';
import { MessageSquare, Plus, SquarePen, Terminal, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AsyncBoundary } from '@/components/AsyncBoundary';
import { ListSkeleton } from '@/components/ListSkeleton';
import { useIsMobile } from '@/components/useMediaQuery';
import type { Agent } from '@/lib/db/schema';

import { AgentAvatar } from './AgentAvatar';

type LoadStatus = 'error' | 'loading' | 'ready';

/** Agent 列表页：查看 / 编辑 / 删除。三态：骨架（加载）/ 失败可重试 / 空态引导。 */
export function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const router = useRouter();

  /** silent：删除后静默刷新（不闪骨架、失败也不把列表换成错误页） */
  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setStatus('loading');
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { agents?: Agent[] };
      setAgents(data.agents ?? []);
      setStatus('ready');
    } catch {
      if (!options?.silent) setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    setConfirmId(null);
    void load({ silent: true });
  };

  return (
    <Flexbox
      gap={16}
      style={{
        margin: '0 auto',
        maxWidth: 880,
        padding: isMobile ? 16 : 24,
        width: '100%',
      }}
    >
      {/* 窄屏：标题与按钮分两行（否则挤在一起） */}
      <Flexbox
        align={isMobile ? 'flex-start' : 'center'}
        gap={isMobile ? 10 : 0}
        horizontal={!isMobile}
        justify="space-between"
      >
        <Text style={{ fontSize: 20, fontWeight: 600 }}>Agent 管理</Text>
        <Flexbox gap={8} horizontal>
          <Button
            icon={<MessageSquare size={16} />}
            onMouseEnter={() => router.prefetch('/chat')}
            onClick={() => router.push('/chat')}
          >
            回到聊天
          </Button>
          <Button
            icon={<Plus size={16} />}
            type="primary"
            onMouseEnter={() => router.prefetch('/agents/new')}
            onClick={() => router.push('/agents/new')}
          >
            新建 Agent
          </Button>
        </Flexbox>
      </Flexbox>

      <AsyncBoundary
        empty={
          <Center style={{ padding: 48 }}>
            <Flexbox align="center" gap={8}>
              <FluentEmoji emoji="🤖" size={48} />
              <Text type="secondary">还没有 Agent，点右上角「新建 Agent」</Text>
            </Flexbox>
          </Center>
        }
        error={status === 'error'}
        isEmpty={agents.length === 0}
        loading={status === 'loading'}
        skeleton={<ListSkeleton rows={3} />}
        onRetry={() => void load()}
      >
        <Flexbox gap={8}>
          {agents.map((agent) => (
            <Flexbox
              align="center"
              gap={12}
              horizontal
              key={agent.id}
              style={{
                background: 'var(--ant-color-bg-container, #fff)',
                border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
                borderRadius: 12,
                padding: 12,
              }}
            >
              <AgentAvatar avatar={agent.avatar} background={agent.backgroundColor} size={40} />
              <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
                <Flexbox align="center" gap={6} horizontal>
                  <Text style={{ fontWeight: 600 }}>{agent.name}</Text>
                  {agent.runtime === 'cli' && (
                    <Tooltip title="外部 CLI Agent">
                      <Icon icon={Terminal} size={14} style={{ opacity: 0.55 }} />
                    </Tooltip>
                  )}
                </Flexbox>
                <Text ellipsis style={{ fontSize: 12 }} type="secondary">
                  {(agent.runtime === 'cli'
                    ? `外部 CLI · ${agent.cliCommand || '未配置命令'}`
                    : (agent.model || '默认模型') +
                      (agent.temperature == null ? '' : ` · 温度 ${agent.temperature}`)) +
                    // 只在显式关掉思考时才标出来：off 最反直觉（用户以为在用推理模型），
                    // 其余档位属于常规调参，不必占地方
                    (agent.reasoningEffort === 'off' ? ' · 无思考' : '')}
                </Text>
                <Text ellipsis style={{ fontSize: 12 }} type="secondary">
                  {agent.systemPrompt || '（未设置人设）'}
                </Text>
              </Flexbox>
              {confirmId === agent.id ? (
                <Flexbox gap={8} horizontal>
                  <Button danger size="small" onClick={() => void remove(agent.id)}>
                    确认删除
                  </Button>
                  <Button size="small" onClick={() => setConfirmId(null)}>
                    取消
                  </Button>
                </Flexbox>
              ) : (
                <Flexbox gap={4} horizontal>
                  <Tooltip title="编辑">
                    <Button
                      icon={<SquarePen size={16} />}
                      type="text"
                      onMouseEnter={() => router.prefetch(`/agents/${agent.id}`)}
                      onClick={() => router.push(`/agents/${agent.id}`)}
                    />
                  </Tooltip>
                  <Tooltip title="删除">
                    <Button
                      danger
                      icon={<Trash2 size={16} />}
                      type="text"
                      onClick={() => setConfirmId(agent.id)}
                    />
                  </Tooltip>
                </Flexbox>
              )}
            </Flexbox>
          ))}
        </Flexbox>
      </AsyncBoundary>
    </Flexbox>
  );
}
