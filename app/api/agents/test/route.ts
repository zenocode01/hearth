import { generateText } from 'ai';

import { createChatModel, MissingLlmConfigError } from '@/lib/llm';

/** POST /api/agents/test —— 用表单里的配置（无需先保存）试一句话，验证人设生效。 */
export async function POST(req: Request) {
  const { systemPrompt, model, temperature } = (await req.json().catch(() => ({}))) as {
    model?: string;
    systemPrompt?: string;
    temperature?: number | null;
  };

  try {
    const { text } = await generateText({
      model: createChatModel(typeof model === 'string' ? model : undefined),
      prompt: '请用一句话介绍你自己（包括你的身份/风格）。',
      instructions: typeof systemPrompt === 'string' && systemPrompt.trim() ? systemPrompt : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
    });
    return Response.json({ text });
  } catch (error) {
    if (error instanceof MissingLlmConfigError) {
      return Response.json(
        { error: `模型未配置：缺少 ${error.missing.join(' / ')}` },
        { status: 500 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
