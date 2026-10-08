import { TOOL_CATALOG } from '@/lib/llm/tools';

/** GET /api/tools —— 内置工具目录（给界面展示：中文名 / 说明 / 参数）。 */
export function GET() {
  return Response.json({ tools: TOOL_CATALOG });
}
