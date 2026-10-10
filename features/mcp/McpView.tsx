'use client';

import { Button, Flexbox, Icon, Input, Text, TextArea } from '@lobehub/ui';
import { ArrowLeft, Plug, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AsyncBoundary } from '@/components/AsyncBoundary';
import { ListSkeleton } from '@/components/ListSkeleton';
import { useIsMobile } from '@/components/useMediaQuery';
import type { McpServer } from '@/lib/db/schema';

type LoadStatus = 'error' | 'loading' | 'ready';

/**
 * MCP 配置页（只支持 Streamable HTTP）：增删、启用/停用、测试连接。
 * 工具会在聊天时并进工具集（见 lib/mcp/tools.ts）。
 */
export function McpView() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const router = useRouter();

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/mcp/servers');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { servers?: McpServer[] };
      setServers(data.servers ?? []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/mcp/servers', {
        body: JSON.stringify({ headers: headers.trim() || undefined, name, url }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? '添加失败');
      } else {
        setName('');
        setUrl('');
        setHeaders('');
        await load();
      }
    } catch {
      setMessage('请求失败，请检查网络');
    } finally {
      setBusy(false);
    }
  };

  const test = async (targetUrl: string, targetHeaders: string | null) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/mcp/test', {
        body: JSON.stringify({ headers: targetHeaders || undefined, url: targetUrl }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const data = (await res.json()) as { count?: number; error?: string; tools?: string[] };
      setMessage(
        res.ok
          ? `连接成功，发现 ${data.count ?? 0} 个工具：${(data.tools ?? []).slice(0, 8).join(', ')}`
          : `测试失败：${data.error ?? res.status}`,
      );
    } catch {
      setMessage('测试请求失败');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (server: McpServer) => {
    await fetch(`/api/mcp/servers/${server.id}`, {
      body: JSON.stringify({ enabled: !server.enabled }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    void load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
    void load();
  };

  return (
    <Flexbox
      gap={16}
      style={{ margin: '0 auto', maxWidth: 880, padding: isMobile ? 16 : 24, width: '100%' }}
    >
      <Flexbox align="center" gap={8} horizontal>
        <Button
          icon={<Icon icon={ArrowLeft} size={16} />}
          size="small"
          type="text"
          onClick={() => router.push('/chat')}
        >
          返回
        </Button>
        <Text style={{ fontSize: 18, fontWeight: 600 }}>MCP</Text>
      </Flexbox>

      <Text style={{ fontSize: 12, lineHeight: 1.7 }} type="secondary">
        接 MCP server（Streamable HTTP）。启用后，它的工具会在聊天里可用（名字前缀{' '}
        <code>mcp__</code>）。
      </Text>

      {/* 新增表单 */}
      <Flexbox
        gap={8}
        style={{
          background: 'var(--ant-color-bg-container, #fff)',
          border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: 600 }}>添加 server</Text>
        <Input placeholder="名字，例如 高德地图" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="URL，例如 https://example.com/mcp"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <TextArea
          autoSize={{ maxRows: 4, minRows: 2 }}
          placeholder={'额外请求头（可选，JSON），例如\n{"Authorization":"Bearer xxx"}'}
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
        />
        <Flexbox gap={6} horizontal>
          <Button loading={busy} size="small" type="primary" onClick={() => void add()}>
            添加
          </Button>
          <Button disabled={!url.trim()} size="small" onClick={() => void test(url, headers.trim() || null)}>
            测试连接
          </Button>
        </Flexbox>
      </Flexbox>

      {message && (
        <Text style={{ fontSize: 12 }} type="secondary">
          {message}
        </Text>
      )}

      <AsyncBoundary
        error={status === 'error'}
        isEmpty={status === 'ready' && servers.length === 0}
        loading={status === 'loading'}
        skeleton={<ListSkeleton rows={2} />}
        empty={
          <Flexbox align="center" gap={8} style={{ padding: 40 }}>
            <Icon icon={Plug} size={28} style={{ opacity: 0.4 }} />
            <Text type="secondary">还没有 MCP server</Text>
          </Flexbox>
        }
        onRetry={() => void load()}
      >
        <Flexbox gap={8}>
          {servers.map((server) => (
            <Flexbox
              align="center"
              gap={8}
              horizontal
              justify="space-between"
              key={server.id}
              style={{
                background: 'var(--ant-color-bg-container, #fff)',
                border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
                borderRadius: 10,
                padding: 12,
              }}
            >
              <Flexbox gap={2} style={{ minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: 600 }}>
                  {server.name}
                  {!server.enabled && (
                    <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, opacity: 0.5 }}>
                      已停用
                    </span>
                  )}
                </Text>
                <Text ellipsis style={{ fontSize: 12 }} type="secondary">
                  {server.url}
                </Text>
              </Flexbox>
              <Flexbox gap={4} horizontal>
                <Button size="small" onClick={() => void test(server.url, server.headers)}>
                  测试
                </Button>
                <Button size="small" onClick={() => void toggle(server)}>
                  {server.enabled ? '停用' : '启用'}
                </Button>
                <Button
                  danger
                  icon={<Icon icon={Trash2} size={14} />}
                  size="small"
                  type="text"
                  onClick={() => void remove(server.id)}
                />
              </Flexbox>
            </Flexbox>
          ))}
        </Flexbox>
      </AsyncBoundary>
    </Flexbox>
  );
}
