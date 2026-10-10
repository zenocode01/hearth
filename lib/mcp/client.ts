/**
 * MCP 客户端（Streamable HTTP）——把外部 MCP server 的工具接进来。
 *
 * 学 LobeHub 的 `src/libs/mcp/client.ts`，但只做最小形态：
 * - **只支持 HTTP**（Streamable HTTP），跳过 stdio（依赖桌面/IPC）；
 * - 进程内 `Map` 缓存 client + 工具清单（5 分钟 TTL），不做空闲淘汰；
 * - 固定超时，失败静默降级（MCP 连不上不能影响正常对话）。
 *
 * 注意：`@modelcontextprotocol/sdk` 要求 Node ≥ 22.22，本机 22.20 实测可用。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface McpServerConfig {
  /** 额外请求头（如 Authorization） */
  headers?: Record<string, string> | null;
  id: string;
  name: string;
  url: string;
}

export interface McpToolInfo {
  description: string;
  inputSchema: unknown;
  name: string;
}

interface Entry {
  client: Client;
  fetchedAt: number;
  tools: McpToolInfo[];
}

/** 工具清单缓存 TTL（毫秒） */
const TOOLS_TTL = 5 * 60_000;
/** 单次 MCP 调用的超时（毫秒），env `MCP_TIMEOUT` 可改 */
const MCP_TIMEOUT = Number(process.env.MCP_TIMEOUT ?? 30_000);

const cache = new Map<string, Entry>();

function cacheKey(server: McpServerConfig): string {
  return `${server.id}::${server.url}::${JSON.stringify(server.headers ?? {})}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms),
    ),
  ]);
}

async function connect(server: McpServerConfig): Promise<Entry> {
  const client = new Client({ name: 'hearth', version: '0.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: server.headers ?? {} },
  });
  await withTimeout(client.connect(transport), MCP_TIMEOUT, `连接 ${server.name}`);
  const listed = await withTimeout(client.listTools(), MCP_TIMEOUT, `列工具 ${server.name}`);
  const tools: McpToolInfo[] = (listed.tools ?? []).map((item) => ({
    description: item.description ?? '',
    inputSchema: item.inputSchema,
    name: item.name,
  }));
  return { client, fetchedAt: Date.now(), tools };
}

async function getEntry(server: McpServerConfig, refresh = false): Promise<Entry> {
  const key = cacheKey(server);
  const cached = cache.get(key);
  if (!refresh && cached && Date.now() - cached.fetchedAt < TOOLS_TTL) return cached;

  // 换了配置/过期 → 关掉旧连接再重连
  if (cached) {
    try {
      await cached.client.close();
    } catch {
      /* 忽略 */
    }
    cache.delete(key);
  }
  const entry = await connect(server);
  cache.set(key, entry);
  return entry;
}

/** 拉取某个 server 的工具清单（带缓存）。 */
export async function listServerTools(server: McpServerConfig, refresh = false): Promise<McpToolInfo[]> {
  return (await getEntry(server, refresh)).tools;
}

/** 调用某个 server 的工具，把结果拍平成文本。 */
export async function callServerTool(
  server: McpServerConfig,
  toolName: string,
  args: unknown,
): Promise<{ isError: boolean; text: string }> {
  const entry = await getEntry(server);
  const result = await withTimeout(
    entry.client.callTool({ arguments: (args ?? {}) as Record<string, unknown>, name: toolName }),
    MCP_TIMEOUT,
    `调用 ${server.name}/${toolName}`,
  );
  const text = ((result.content ?? []) as Array<{ text?: string; type: string }>)
    .map((block) => (block.type === 'text' ? (block.text ?? '') : `[${block.type}]`))
    .join('\n');
  return { isError: result.isError === true, text };
}

/** 测试连接：连上并返回工具名清单（供配置页"测试"用）。 */
export async function testServer(server: McpServerConfig): Promise<McpToolInfo[]> {
  const entry = await getEntry(server, true);
  return entry.tools;
}

/** 清缓存（server 改动后调用）。 */
export function clearMcpCache(): void {
  for (const entry of cache.values()) {
    void entry.client.close().catch(() => {});
  }
  cache.clear();
}
