import { readLlmConfig } from '@/lib/llm/config';

/** GET /api/models —— 从（OpenAI 兼容的）provider 拉模型列表，供 Agent 表单下拉使用。 */
export async function GET() {
  const result = readLlmConfig();
  if (!result.ok) return Response.json({ models: [] });

  try {
    const res = await fetch(`${result.config.baseURL.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${result.config.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return Response.json({ models: [] });

    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));

    return Response.json({ models });
  } catch {
    // 拉不到就留空，表单会退化成手填
    return Response.json({ models: [] });
  }
}
