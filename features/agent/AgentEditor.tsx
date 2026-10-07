'use client';

import {
  Button,
  ColorSwatches,
  EmojiPicker,
  Flexbox,
  Icon,
  Input,
  Segmented,
  Select,
  Text,
  TextArea,
  primaryColorsSwatches,
} from '@lobehub/ui';
import { toast } from '@lobehub/ui/base-ui';
import { Slider } from 'antd';
import { ArrowLeft, Bot, Check, FlaskConical, Terminal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { Agent } from '@/lib/db/schema';

import { AgentAvatar } from './AgentAvatar';

interface AgentEditorProps {
  /** 'new' 表示新建 */
  id: string;
}

/** 外部 CLI 的常用预设（占位符见下方说明） */
const CLI_PRESETS = [
  { label: 'Pi', value: 'pi -p --mode json --system-prompt "{{systemPrompt}}" "{{prompt}}"' },
  { label: 'OpenCode', value: 'opencode run "{{prompt}}"' },
  {
    label: 'Claude Code',
    value: 'claude -p --append-system-prompt "{{systemPrompt}}" "{{prompt}}"',
  },
];

const runtimeOption = (icon: typeof Bot, label: string): ReactNode => (
  <span style={{ alignItems: 'center', display: 'inline-flex', gap: 6 }}>
    <Icon icon={icon} size={14} />
    {label}
  </span>
);

const RUNTIME_OPTIONS = [
  { label: runtimeOption(Bot, '内置模型'), value: 'api' },
  { label: runtimeOption(Terminal, '外部 CLI'), value: 'cli' },
];

const cardStyle = {
  background: 'var(--ant-color-bg-container, #fff)',
  border: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.08))',
  borderRadius: 12,
  padding: 16,
} as const;

const Field = ({ children, label }: { children: ReactNode; label: string }) => (
  <Flexbox gap={8}>
    <Text style={{ fontSize: 12, opacity: 0.6 }}>{label}</Text>
    {children}
  </Flexbox>
);

/** Agent 编辑页：预览 + 基本信息（头像/底色/名称）+ 人设 + 模型与参数 + 测试。 */
export function AgentEditor({ id }: AgentEditorProps) {
  const isNew = id === 'new';
  const router = useRouter();

  const [avatar, setAvatar] = useState('😀');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [runtime, setRuntime] = useState<'api' | 'cli'>('api');
  const [cliCommand, setCliCommand] = useState('');
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
        setBackgroundColor(agent.backgroundColor ?? '');
        setName(agent.name);
        setSystemPrompt(agent.systemPrompt ?? '');
        setRuntime(agent.runtime === 'cli' ? 'cli' : 'api');
        setCliCommand(agent.cliCommand ?? '');
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
    () => ({ avatar, backgroundColor, cliCommand, model, name, runtime, systemPrompt, temperature }),
    [avatar, backgroundColor, cliCommand, model, name, runtime, systemPrompt, temperature],
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
    <Flexbox gap={16} style={{ margin: '0 auto', maxWidth: 760, padding: 24, width: '100%' }}>
      {/* 顶栏 */}
      <Flexbox align="center" horizontal justify="space-between">
        <Flexbox align="center" gap={4} horizontal>
          <Button icon={<ArrowLeft size={16} />} type="text" onClick={() => router.push('/agents')} />
          <Text style={{ fontSize: 18, fontWeight: 600 }}>{isNew ? '新建 Agent' : '编辑 Agent'}</Text>
        </Flexbox>
        <Flexbox gap={8} horizontal>
          <Button icon={<FlaskConical size={16} />} loading={testing} onClick={() => void test()}>
            测试
          </Button>
          <Button icon={<Check size={16} />} loading={saving} type="primary" onClick={() => void save()}>
            保存
          </Button>
        </Flexbox>
      </Flexbox>

      {/* 预览：改什么立刻在这里看到 */}
      <Flexbox align="center" gap={14} horizontal style={cardStyle}>
        <AgentAvatar avatar={avatar} background={backgroundColor} size={56} />
        <Flexbox gap={2} style={{ minWidth: 0 }}>
          <Text style={{ fontSize: 16, fontWeight: 600 }}>{name || '未命名 Agent'}</Text>
          <Text style={{ fontSize: 12 }} type="secondary">
            {runtime === 'cli' ? '外部 CLI Agent' : `${model || '默认模型'} · 温度 ${temperature.toFixed(1)}`}
          </Text>
          <Text ellipsis style={{ fontSize: 12 }} type="secondary">
            {systemPrompt || '（未设置人设）'}
          </Text>
        </Flexbox>
      </Flexbox>

      {/* 基本信息 */}
      <Flexbox gap={16} style={cardStyle}>
        <Text style={{ fontSize: 13, fontWeight: 600 }}>基本信息</Text>
        <Flexbox align="flex-start" gap={16} horizontal>
          <Field label="头像">
            <EmojiPicker
              allowUpload={false}
              shape="square"
              size={48}
              value={avatar}
              onChange={(emoji) => setAvatar(emoji)}
            />
          </Field>
          <Flexbox flex={1} gap={14}>
            <Field label="名称">
              <Input
                placeholder="例如：资深后端工程师"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="头像底色">
              <ColorSwatches
                colors={primaryColorsSwatches.map((color) => ({ color }))}
                size={18}
                value={backgroundColor || undefined}
                onChange={(color) => setBackgroundColor(color ?? '')}
              />
            </Field>
          </Flexbox>
        </Flexbox>
      </Flexbox>

      {/* 人设 */}
      <Flexbox gap={10} style={cardStyle}>
        <Flexbox gap={2}>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>人设（系统提示词）</Text>
          <Text style={{ fontSize: 12 }} type="secondary">
            这段文字会在每次对话时作为系统指令发给模型——决定它的身份、语气与回答方式。
          </Text>
        </Flexbox>
        <TextArea
          autoSize={{ maxRows: 14, minRows: 6 }}
          placeholder="例如：你是一位资深后端工程师。回答要求：先给结论，再列不超过 3 个要点，语气专业克制，不使用任何语气词和玩笑。"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
        />
      </Flexbox>

      {/* 运行方式：内置模型 API 或外部 CLI agent */}
      <Flexbox gap={16} style={cardStyle}>
        <Flexbox gap={2}>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>运行方式</Text>
          <Text style={{ fontSize: 12 }} type="secondary">
            内置模型走 .env.local 的接口；外部 CLI 把消息交给本机的命令行 agent（pi / opencode / claude…）执行。
          </Text>
        </Flexbox>
        <Segmented
          block
          options={RUNTIME_OPTIONS}
          value={runtime}
          onChange={(value) => setRuntime(value as 'api' | 'cli')}
        />

        {runtime === 'api' ? (
          <Flexbox align="flex-start" gap={24} horizontal>
            <Flexbox flex={1}>
              <Field label="模型">
                <Select
                  options={[
                    { label: '默认（.env.local 里的模型）', value: '' },
                    ...models.map((item) => ({ label: item, value: item })),
                  ]}
                  value={model}
                  onChange={(value) => setModel(value as string)}
                />
              </Field>
            </Flexbox>
            <Flexbox flex={1}>
              <Field label={`温度：${temperature.toFixed(1)}`}>
                <Slider
                  max={2}
                  min={0}
                  step={0.1}
                  value={temperature}
                  onChange={(value) => setTemperature(value as number)}
                />
              </Field>
            </Flexbox>
          </Flexbox>
        ) : (
          <Flexbox gap={10}>
            <Field label="命令模板">
              <TextArea
                autoSize={{ maxRows: 6, minRows: 3 }}
                placeholder={'pi -p --system-prompt "{{systemPrompt}}" "{{prompt}}"'}
                value={cliCommand}
                onChange={(event) => setCliCommand(event.target.value)}
              />
            </Field>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CLI_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="small"
                  title={preset.value}
                  onClick={() => setCliCommand(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Text style={{ fontSize: 12 }} type="secondary">
              {'{{prompt}}'} 会替换成「对话历史 + 本次输入」，{'{{systemPrompt}}'} 替换成人设；模板里没有{' '}
              {'{{prompt}}'} 时内容从 stdin 传入。
            </Text>
            <Text style={{ fontSize: 12 }} type="secondary">
              命令在本机执行（不走 shell，参数不会被当成 shell 语法）；请确保该 CLI 已装好并已登录。
            </Text>
            <Text style={{ fontSize: 12 }} type="secondary">
              若 CLI 输出 JSON 事件流（如 pi 的 --mode json），其中的思考过程会自动解析成「思考过程」块。
            </Text>
          </Flexbox>
        )}
      </Flexbox>

      {/* 测试结果 */}
      {testResult && (
        <Flexbox gap={8} style={cardStyle}>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>测试结果</Text>
          <div
            style={{
              background: 'var(--ant-color-fill-tertiary, rgba(0, 0, 0, 0.03))',
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.7,
              padding: 12,
              whiteSpace: 'pre-wrap',
            }}
          >
            {testResult}
          </div>
        </Flexbox>
      )}
    </Flexbox>
  );
}
