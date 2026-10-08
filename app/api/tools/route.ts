import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { isPiCommand, listPiTools } from '@/lib/llm/piTools';
import { TOOL_CATALOG } from '@/lib/llm/tools';

/**
 * GET /api/tools?agentId=xxx —— 当前 Agent 能用的工具：
 * - 内置模型：Hearth 的内置工具目录（可开关，随会话保存）
 * - 外部 CLI = pi：**pi 自带的工具清单**（启用状态实时读 pi 的 settings.json）
 * - 其它外部 CLI：工具由该 CLI 自己管理（返回空清单 + 说明）
 */
export function GET(req: Request) {
  const agentId = new URL(req.url).searchParams.get('agentId');
  const agent = agentId ? (getDb().select().from(agents).where(eq(agents.id, agentId)).get() ?? null) : null;

  if (agent?.runtime === 'cli') {
    if (isPiCommand(agent.cliCommand)) {
      const { enabledTools, settingsPath, tools } = listPiTools();
      return Response.json({
        enabledCount: enabledTools.length,
        note: 'pi 的工具由 pi 自己管理：改 ~/.pi/agent/settings.json 的 defaultTools，或在命令模板里加 --tools / --exclude-tools。',
        runtime: 'pi',
        settingsPath,
        tools,
      });
    }

    return Response.json({
      note: `这个 Agent 走外部 CLI（${agent.cliCommand?.trim().split(/\s+/)[0] || '未配置命令'}），工具由它自己管理，Hearth 看不到清单。`,
      runtime: 'external',
      tools: [],
    });
  }

  return Response.json({ runtime: 'builtin', tools: TOOL_CATALOG });
}
