'use client';

import { Button, Flexbox, FluentEmoji, Input, Select, Text, TextArea } from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { Slider } from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import type { Agent } from '@/lib/db/schema';

const AVATAR_PRESETS = ['😀', '🧑‍💻', '🦉', '🎭', '🧠', '🐱', '🤖', '✍️'];

interface AgentEditorProps {
  /** 'new' 表示新建 */
  id: string;
}

/** Agent 编辑页：头像 / 名称 / 人设 / 模型 / 温度 + 测试。 */
export function AgentEditor({ id }: AgentEditorProps) {
  const isNew = id === 'new';
  const router = useRouter();

  const [avatar, setAvatar] = useState('😀');
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // 编辑已有 Agent：加载
  useEffect(() => {
    if (isNew) return;
    void fetch(`/api/agents/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
      .then((data: { agent?: Agent }) => {
        const agent = data.agent;
        if (!agent) return;
        setAvatar(agent.avatar ?? '😀');
        setName(agent.name);
        setSystemPrompt(agent.systemPrompt ?? '');
        setModel(agent.model ?? '');
        setTemperature(agent.temperature ?? 0.7);
      })
      .catch(() => toast.error('Agent 不存在'));
  }, [id, isNew]);

  // 可选的模型列表（拉不到就只保留"默认"）
  useEffect(() => {
    void fetch('/api/models')
      .then((res) => res.json())
      .then((data: { models?: string[] }) => setModels(data.models ?? []))
      .catch(() => setModels([]));
  }, []);

  const payload = useCallback(
    () => ({ avatar, model, name, systemPrompt, temperature }),
    [avatar, model, name, systemPrompt, temperature],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(isNew ? '/api/agents' : `/api/agents/${id}`, {
        body: JSON.stringify(payload()),
        headers: { 'content-type': 'application/json' },
        method: isNew ? 'POST' : 'PATCH',
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success('已保存');
      router.push('/agents');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [id, isNew, payload, router]);

  const test = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/agents/test', {
        body: JSON.stringify(payload()),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const data = (await res.json()) as { error?: string; text?: string };
      setTestResult(data.text ?? `失败：${data.error ?? '未知错误'}`);
    } catch {
      setTestResult('测试失败：无法连接服务');
    } finally {
      setTesting(false);
    }
  }, [payload]);

  return (
    <Flexbox gap={16} style={{ margin: '0 auto', maxWidth: 720, padding: 24, width: '100%' }}>
      <Flexbox align="center" horizontal justify="space-between">
        <Text style={{ fontSize: 20, fontWeight: 600 }}>{isNew ? '新建 Agent' : '编辑 Agent'}</Text>
        <Button onClick={() => router.push('/agents')}>返回列表</Button>
      </Flexbox>

      <Flexbox gap={8}>
        <Text style={{ fontSize: 13 }} type="secondary">
          头像
        </Text>
        <Flexbox align="center" gap={8} horizontal>
          <FluentEmoji emoji={avatar} size={32} />
          <Input
            style={{ width: 180 }}
            value={avatar}
            onChange={(event) => setAvatar(event.target.value)}
          />
          <Flexbox gap={4} horizontal>
            {AVATAR_PRESETS.map((preset) => (
              <Button key={preset} size="small" type="text" onClick={() => setAvatar(preset)}>
                {preset}
              </Button>
            ))}
          </Flexbox>
        </Flexbox>
      </Flexbox>

      <Flexbox gap={8}>
        <Text style={{ fontSize: 13 }} type="secondary">
          名称
        </Text>
        <Input
          placeholder="例如：资深后端工程师"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Flexbox>

      <Flexbox gap={8}>
        <Text style={{ fontSize: 13 }} type="secondary">
          人设（系统提示词）
        </Text>
        <TextArea
          autoSize={{ maxRows: 12, minRows: 5 }}
          placeholder="例如：你是一位资深后端工程师，回答简洁、先给结论，再给必要的代码示例。"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
        />
      </Flexbox>

      <Flexbox align="center" gap={12} horizontal>
        <Flexbox flex={1} gap={8}>
          <Text style={{ fontSize: 13 }} type="secondary">
            模型
          </Text>
          <Select
            options={[
              { label: '默认（.env.local 里的模型）', value: '' },
              ...models.map((item) => ({ label: item, value: item })),
            ]}
            value={model}
            onChange={(value) => setModel(value as string)}
          />
        </Flexbox>

        <Flexbox flex={1} gap={8}>
          <Text style={{ fontSize: 13 }} type="secondary">
            温度：{temperature.toFixed(1)}
          </Text>
          <Slider
            max={2}
            min={0}
            step={0.1}
            value={temperature}
            onChange={(value) => setTemperature(value as number)}
          />
        </Flexbox>
      </Flexbox>

      {testResult && (
        <div
          style={{
            background: 'var(--ant-color-fill-tertiary, rgba(0,0,0,0.03))',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.7,
            padding: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {testResult}
        </div>
      )}

      <Flexbox gap={8} horizontal>
        <Button loading={saving} type="primary" onClick={() => void save()}>
          保存
        </Button>
        <Button loading={testing} onClick={() => void test()}>
          测试（问一句固定问题）
        </Button>
      </Flexbox>
    </Flexbox>
  );
}
