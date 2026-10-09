import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { readBuiltinModelCapabilities, readPiModelCapabilities } from '@/lib/llm/capabilities/thinkingLevels';
import { REASONING_EFFORTS } from '@/lib/llm/reasoning';

/**
 * GET /api/reasoning/levels?agentId=… —— 这个 Agent 当前**真正生效**的思考档位。
 *
 * Agent 编辑页用它过滤下拉：模型不支持的档位（比如关不掉思考的模型上的"关闭"）
 * 不该出现在选项里——选了也不会报错，但也不会有任何变化，用户只会以为是 bug。
 *
 * 读不到能力信息时 `supportedLevels` 为 null，意思是"不知道，别限制"。
 */
export async function GET(req: Request) {
  const agentId = new URL(req.url).searchParams.get('agentId');
  const agent = agentId
    ? getDb().select().from(agents).where(eq(agents.id, agentId)).get()
    : undefined;

  const caps = agent?.runtime === 'cli' ? readPiModelCapabilities() : readBuiltinModelCapabilities();

  return Response.json({
    // 模型把某档改了名（如 high → xhigh），UI 要能提示
    aliases: caps?.levelAliases ?? {},
    levels: REASONING_EFFORTS.map((item) => ({ label: item.label, value: item.value })),
    modelId: caps?.modelId ?? null,
    runtime: agent?.runtime ?? null,
    supported: caps?.supportedLevels ?? null,
  });
}