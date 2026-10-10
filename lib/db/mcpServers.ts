import { desc, eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { mcpServers, type McpServer } from '@/lib/db/schema';
import type { McpServerConfig } from '@/lib/mcp/client';

/** MCP server 的 DB 读写（配置页与聊天路由共用）。 */
export function listMcpServers(): McpServer[] {
  return getDb().select().from(mcpServers).orderBy(desc(mcpServers.updatedAt)).all();
}

export function getMcpServer(id: string): McpServer | null {
  return getDb().select().from(mcpServers).where(eq(mcpServers.id, id)).get() ?? null;
}

/** DB 行 → 客户端配置（解析 headers JSON）。 */
export function toConfig(row: McpServer): McpServerConfig {
  let headers: Record<string, string> | null = null;
  if (row.headers) {
    try {
      const parsed = JSON.parse(row.headers) as unknown;
      if (parsed && typeof parsed === 'object') headers = parsed as Record<string, string>;
    } catch {
      /* 脏数据忽略 */
    }
  }
  return { headers, id: row.id, name: row.name, url: row.url };
}

/** 已启用的 server 配置（聊天路由用）。 */
export function listEnabledConfigs(): McpServerConfig[] {
  return listMcpServers()
    .filter((row) => row.enabled)
    .map(toConfig);
}

export function createMcpServer(input: { headers?: string | null; name: string; url: string }): McpServer {
  const now = new Date();
  const row: McpServer = {
    createdAt: now,
    enabled: true,
    headers: input.headers ?? null,
    id: createId('mcp'),
    name: input.name,
    updatedAt: now,
    url: input.url,
  };
  getDb().insert(mcpServers).values(row).run();
  return row;
}

export function updateMcpServer(
  id: string,
  patch: { enabled?: boolean; headers?: string | null; name?: string; url?: string },
): void {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.url !== undefined) set.url = patch.url;
  if (patch.headers !== undefined) set.headers = patch.headers;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  getDb().update(mcpServers).set(set).where(eq(mcpServers.id, id)).run();
}

export function deleteMcpServer(id: string): void {
  getDb().delete(mcpServers).where(eq(mcpServers.id, id)).run();
}
