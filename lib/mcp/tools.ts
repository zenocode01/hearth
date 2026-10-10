/**
 * 把 MCP server 的工具转成 AI SDK 的 tool，并进我们的工具集。
 *
 * 命名：`mcp__<serverId>__<toolName>`（LobeHub 原生 MCP 直接透传 toolName、用 manifest
 * 的 identifier 标识来源；我们是单进程、工具是平铺的，用前缀把来源编进名字更省事，
 * 也让 UI 的 tool 卡片能看出它来自哪个 server）。
 */
import { jsonSchema, tool } from 'ai';

import { callServerTool, listServerTools, type McpServerConfig } from './client';

/** 工具名只留 [A-Za-z0-9_-]（provider 对函数名的限制）。 */
function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function mcpToolName(serverId: string, toolName: string): string {
  return `mcp__${sanitize(serverId)}__${sanitize(toolName)}`;
}

/** 工具名前缀，UI 用来判断"这是 MCP 工具"。 */
export const MCP_TOOL_PREFIX = 'mcp__';

/**
 * 逐个 server 拉工具清单并转成 tool；某个 server 失败只跳过它（不影响别的 / 不影响对话）。
 */
export async function buildMcpTools(servers: McpServerConfig[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  await Promise.all(
    servers.map(async (server) => {
      let tools;
      try {
        tools = await listServerTools(server);
      } catch (error) {
        console.error(
          `[mcp] 拉取「${server.name}」的工具失败，本次跳过：`,
          error instanceof Error ? error.message : error,
        );
        return;
      }

      for (const item of tools) {
        out[mcpToolName(server.id, item.name)] = tool({
          description: `[MCP·${server.name}] ${item.description || item.name}`,
          inputSchema: jsonSchema(
            (item.inputSchema ?? { additionalProperties: false, properties: {}, type: 'object' }) as never,
          ),
          execute: async (args) => {
            const { isError, text } = await callServerTool(server, item.name, args);
            if (isError) throw new Error(text || `MCP 工具 ${item.name} 执行失败`);
            return { text };
          },
        });
      }
    }),
  );

  return out;
}
