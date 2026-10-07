import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';

import { createChatModel, MissingLlmConfigError } from '@/lib/llm';

export const maxDuration = 60;

/** 把底层错误翻译成用户可读的提示（验收项：错 key / 断网必须有可读错误）。 */
function humanizeError(error: unknown): string {
  const status = (error as { statusCode?: number } | undefined)?.statusCode;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 401 || status === 403) {
    return `模型服务拒绝了请求（${status}）：请检查 .env.local 中的 LLM_API_KEY 是否正确。`;
  }
  if (status === 404) {
    return `接口或模型不存在（404）：请检查 LLM_BASE_URL 与 LLM_MODEL 是否正确。`;
  }
  if (status === 429) {
    return `请求过于频繁或额度不足（429）：请稍后重试，或检查账户余额。`;
  }
  if (typeof status === 'number') {
    return `模型服务返回错误（${status}）：${message}`;
  }
  if (/fetch|network|ECONN|ENOTFOUND|timeout/i.test(message)) {
    return `无法连接模型服务：请检查网络，以及 LLM_BASE_URL 是否可达。`;
  }
  return `请求失败：${message}`;
}

export async function POST(req: Request) {
  let model;
  try {
    model = createChatModel();
  } catch (error) {
    if (error instanceof MissingLlmConfigError) {
      return new Response(
        `模型未配置：请在项目根目录的 .env.local 中填写 ${error.missing.join(' / ')}（可参考 .env.example），然后重启 dev server。`,
        { status: 500 },
      );
    }
    throw error;
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: humanizeError,
    }),
  });
}
