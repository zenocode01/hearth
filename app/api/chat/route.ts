import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { messages as messagesTable, topics } from '@/lib/db/schema';
import { createChatModel, MissingLlmConfigError } from '@/lib/llm';

export const maxDuration = 60;

/** 把一条 UIMessage 的文本部分拼起来。 */
function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

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
  const requestStartedAt = Date.now();
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

  const {
    messages: uiMessages,
    topicId,
  }: { messages: UIMessage[]; topicId?: string } = await req.json();

  // 落库：本次新发的用户消息（id 天然去重，重复提交不会写两条）
  if (topicId) {
    const lastUser = [...uiMessages].reverse().find((message) => message.role === 'user');
    const text = lastUser ? textOf(lastUser) : '';
    if (lastUser && text) {
      try {
        getDb()
          .insert(messagesTable)
          .values({ content: text, createdAt: new Date(), id: lastUser.id, role: 'user', topicId })
          .onConflictDoNothing()
          .run();
      } catch (error) {
        console.error('[chat] 保存用户消息失败', error);
      }
    }
  }

  const result = streamText({
    model,
    messages: await convertToModelMessages(uiMessages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: humanizeError,
      // 流式结束后把 AI 回复落库（正文 + 推理过程），不阻塞客户端
      onEnd: ({ responseMessage }) => {
        if (!topicId) return;

        const joinParts = (type: 'reasoning' | 'text') =>
          responseMessage.parts
            .map((part) => (part.type === type ? part.text : ''))
            .join('')
            .trim();

        const text = joinParts('text');
        const reasoning = joinParts('reasoning');
        if (!text && !reasoning) return;

        try {
          const db = getDb();
          db.insert(messagesTable)
            .values({
              content: text,
              createdAt: new Date(),
              id: createId('msg'),
              reasoning: reasoning || null,
              reasoningMs: reasoning ? Date.now() - requestStartedAt : null,
              role: 'assistant',
              topicId,
            })
            .run();
          db.update(topics).set({ updatedAt: new Date() }).where(eq(topics.id, topicId)).run();
        } catch (error) {
          console.error('[chat] 保存 AI 回复失败', error);
        }
      },
    }),
  });
}
