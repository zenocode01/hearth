import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  InvalidToolInputError,
  NoSuchToolError,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
  type UIMessageStreamOnEndCallback,
} from 'ai';
import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { createId } from '@/lib/db/id';
import { serializeParts } from '@/lib/db/messageParts';
import { agents, messages as messagesTable, topics } from '@/lib/db/schema';
import { createChatModel, MissingLlmConfigError } from '@/lib/llm';
import { buildCliPrompt, runCliAgent, type CliChunk } from '@/lib/llm/cli';
import { chatTools, resolveChatTools } from '@/lib/llm/tools';
import { enabledToolNames, parseToolSettings } from '@/lib/tools/settings';

export const maxDuration = 300;

/** 把一条 UIMessage 的文本部分拼起来。 */
function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

/** 把底层错误翻译成用户可读的提示（验收项：错 key / 断网必须有可读错误）。 */
function humanizeError(error: unknown): string {
  // 工具类错误优先：模型偶尔会调用不存在的工具（或参数不合法），这不是网络问题
  if (NoSuchToolError.isInstance(error)) {
    return `模型想调用一个不存在的工具，已跳过这次调用，它会自己换一种方式继续。`;
  }
  if (InvalidToolInputError.isInstance(error)) {
    return `工具参数不合法，已跳过这次调用。`;
  }

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
  // 注意：不要用裸 "fetch" 做关键词——工具报错信息里会出现 fetch_url 这种工具名，会误判
  if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|socket hang up|network error|timed? ?out/i.test(message)) {
    return `无法连接模型服务：请检查网络，以及 LLM_BASE_URL 是否可达。`;
  }
  return `请求失败：${message}`;
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now();

  const {
    messages: uiMessages,
    topicId,
    agentId,
    tools: bodyTools,
  }: {
    agentId?: string;
    messages: UIMessage[];
    tools?: unknown;
    topicId?: string;
  } = await req.json();

  const db = getDb();
  // 会话自身的 Agent 优先于请求携带的（换人设立即生效：每次都按 id 实时读库）
  let effectiveAgentId = agentId ?? null;
  const topicRow = topicId
    ? (db.select().from(topics).where(eq(topics.id, topicId)).get() ?? null)
    : null;
  if (topicRow?.agentId) effectiveAgentId = topicRow.agentId;
  const agent = effectiveAgentId
    ? (db.select().from(agents).where(eq(agents.id, effectiveAgentId)).get() ?? null)
    : null;

  // 工具开关：会话里存的为准（新会话用请求里带的）；没有设置 = 全部自动启用
  const toolSettings =
    parseToolSettings(topicRow?.tools) ??
    parseToolSettings(bodyTools === undefined ? null : JSON.stringify(bodyTools));
  const chatToolsForTurn = resolveChatTools(
    enabledToolNames(toolSettings, Object.keys(chatTools)),
  );

  // 落库：本次新发的用户消息（id 天然去重，重复提交不会写两条）
  if (topicId) {
    const lastUser = [...uiMessages].reverse().find((message) => message.role === 'user');
    const text = lastUser ? textOf(lastUser) : '';
    if (lastUser && text) {
      try {
        db.insert(messagesTable)
          .values({ content: text, createdAt: new Date(), id: lastUser.id, role: 'user', topicId })
          .onConflictDoNothing()
          .run();
      } catch (error) {
        console.error('[chat] 保存用户消息失败', error);
      }
    }
  }

  /** 流结束后把 AI 回复（正文 + 推理 + 工具调用）落库，两条路径共用。 */
  const persistAssistant: UIMessageStreamOnEndCallback<UIMessage> = ({ responseMessage }) => {
    if (!topicId) return;

    const joinParts = (type: 'reasoning' | 'text') =>
      responseMessage.parts
        .map((part) => (part.type === type ? part.text : ''))
        .join('')
        .trim();

    const text = joinParts('text');
    const reasoning = joinParts('reasoning');
    // 有序片段：刷新后能原样恢复工具卡片与交错顺序（与 SDK 解耦，见 messageParts.ts）
    const storedParts = serializeParts(responseMessage.parts);
    const hasToolCall = storedParts.some((part) => part.type === 'tool');
    if (!text && !reasoning && !hasToolCall) return;

    try {
      db.insert(messagesTable)
        .values({
          content: text,
          createdAt: new Date(),
          // 与客户端内存里的消息 id 一致（见 generateId / generateMessageId）
          id: responseMessage.id ?? createId('msg'),
          parts: JSON.stringify(storedParts),
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
  };

  // ---------- 外部 CLI 型 Agent（pi / opencode / claude …） ----------
  if (agent?.runtime === 'cli') {
    const command = agent.cliCommand?.trim();
    if (!command) {
      return new Response(
        '这个 Agent 是「外部 CLI」模式，但还没填命令。去 Agent 编辑页填写，例如：pi -p "{{prompt}}"',
        { status: 500 },
      );
    }

    const lastUser = [...uiMessages].reverse().find((message) => message.role === 'user');
    const question = lastUser ? textOf(lastUser) : '';
    const history = uiMessages
      .filter((message) => message.id !== lastUser?.id)
      .map((message) => ({ content: textOf(message), role: message.role as 'assistant' | 'user' }))
      .filter((item) => item.content);

    const cliStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const textId = createId('txt');
        const reasoningId = createId('rea');
        let textOpen = false;
        let reasoningOpen = false;

        /** 按片段类型懒开启对应的 part（CLI 的思考与正文可能交错到达）。 */
        const writeChunk = (chunk: CliChunk) => {
          if (chunk.kind === 'reasoning') {
            if (!reasoningOpen) {
              writer.write({ id: reasoningId, type: 'reasoning-start' });
              reasoningOpen = true;
            }
            writer.write({ delta: chunk.delta, id: reasoningId, type: 'reasoning-delta' });
            return;
          }
          if (!textOpen) {
            writer.write({ id: textId, type: 'text-start' });
            textOpen = true;
          }
          writer.write({ delta: chunk.delta, id: textId, type: 'text-delta' });
        };

        try {
          for await (const chunk of runCliAgent({
            command,
            prompt: buildCliPrompt({
              history,
              question,
              // 模板里有 {{systemPrompt}} 就交给 CLI，没有则并进 prompt
              systemPrompt: command.includes('{{systemPrompt}}') ? null : agent.systemPrompt,
            }),
            systemPrompt: agent.systemPrompt,
          })) {
            writeChunk(chunk);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          writeChunk({ delta: `\n\n> 运行失败：${message}`, kind: 'text' });
        }

        if (reasoningOpen) writer.write({ id: reasoningId, type: 'reasoning-end' });
        if (textOpen) writer.write({ id: textId, type: 'text-end' });
      },
      generateId: () => createId('msg'),
      onEnd: persistAssistant,
      onError: (error) =>
        `外部命令执行失败：${error instanceof Error ? error.message : String(error)}`,
      originalMessages: uiMessages,
    });

    return createUIMessageStreamResponse({ stream: cliStream });
  }

  // ---------- 内置模型 API（默认） ----------
  let model;
  try {
    model = createChatModel(agent?.model);
  } catch (error) {
    if (error instanceof MissingLlmConfigError) {
      return new Response(
        `模型未配置：请在项目根目录的 .env.local 中填写 ${error.missing.join(' / ')}（可参考 .env.example），然后重启 dev server。`,
        { status: 500 },
      );
    }
    throw error;
  }

  const result = streamText({
    model,
    // v7 不允许在 messages 里放 system 消息，人设走 instructions
    instructions: agent?.systemPrompt ?? undefined,
    messages: await convertToModelMessages(uiMessages),
    temperature: agent?.temperature ?? undefined,
    // 内置工具（L2-11）：按会话开关筛选；模型主动调用 → 服务端执行 → 结果回填后继续生成
    tools: Object.keys(chatToolsForTurn).length > 0 ? chatToolsForTurn : undefined,
    // 最多 5 步（多轮工具调用），避免模型陷入死循环
    stopWhen: stepCountIs(5),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: humanizeError,
      // 传 originalMessages 进入"持久化模式"，再给 generateMessageId 才会分配 id；
      // 该 id 会随流下发给客户端，因此两端一致（删除 / 重新生成按 id 匹配才有效）
      originalMessages: uiMessages,
      generateMessageId: () => createId('msg'),
      onEnd: persistAssistant,
    }),
  });
}
