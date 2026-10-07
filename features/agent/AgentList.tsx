'use client';

import { Button, Center, Flexbox, FluentEmoji, Icon, Text, Tooltip } from '@lobehub/ui';
import { MessageSquare, Plus, SquarePen, Terminal, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import type { Agent } from '@/lib/db/schema';

import { AgentAvatar } from './AgentAvatar';

/** Agent 列表页：查看 / 编辑 / 删除。 */
export function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = (await res.json()) as { agents?: Agent[] };
      setAgents(data.agents ?? []);
    } catch {
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (id: string) => {
    await fetch(`/api/agents/${id}`, { method: 'DELETE' });
    setConfirmId(null);
    void refresh();
  };

  return (
    <Flexbox gap={16} style={{ margin: '0 auto', maxWidth: 880, padding: 24, width: '100%' }}>
      <Flexbox align="center" horizontal justify="space-between">
        <Text style={{ fontSize: 20, fontWeight: 600 }}>Agent 管理</Text>
        <Flexbox gap={8} horizontal>
          <Button icon={<MessageSquare size={16} />} onClick={() => router.push('/chat')}>
            回到聊天
          </Button>
          <Button icon={<Plus size={16} />} type="primary" onClick={() => router.push('/agents/new')}>
            新建 Agent
          </Button>
        </Flexbox>
      </Flexbox>

      {agents.length === 0 ? (
        <Center style={{ padding: 48 }}>
          <Flexbox align="center" gap={8}>
            <FluentEmoji emoji="🤖" size={48} />
            <Text type="secondary">还没有 Agent，点右上角「新建 Agent」</Text>
          </Flexbox>
        </Center>
      ) : (
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
                <Text style={{ fontSize: 12 }} type="secondary">
                  {agent.runtime === 'cli'
                    ? `外部 CLI · ${agent.cliCommand || '未配置命令'}`
                    : (agent.model || '默认模型') +
                      (agent.temperature == null ? '' : ` · 温度 ${agent.temperature}`)}
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
      )}
    </Flexbox>
  );
}
