/**
 * 外部 agent 的**统一事件模型** + 协议无关的基础件。
 *
 * 设计（学 LobeHub 的 `HeterogeneousEventType` + 每 agent 一个 adapter）：
 * - 所有外部 CLI 的输出，最终都归一到 `AgentEvent`（思考 / 正文 / 工具）；
 * - 协议差异收敛在 `lib/llm/adapters.ts` 的薄 adapter 里，上层（聊天路由/渲染）对协议无感；
 * - 本文件放**共享**的东西：事件类型、ANSI 清理、pi 事件解析（pi 的 JSONL 协议）与错误翻译。
 */

/** 外部 CLI 输出的一个片段：正文 / 思考 / 工具调用。 */
export type AgentEvent =
  | { delta: string; kind: 'reasoning' | 'text' }
  | {
      kind: 'tool';
      tool: {
        /** 工具名（pi 自带的：read / bash / edit / write / grep / find / ls / powershell…） */
        name: string;
        /** 工具调用 id（输入与结果配对用） */
        toolCallId: string;
        /** input-available：参数已到齐；output-available / output-error：执行结果 */
        state: 'input-available' | 'output-available' | 'output-error';
        /** 工具自带的展示元信息（pi 扩展的 details，如 todo 清单） */
        details?: unknown;
        errorText?: string;
        input?: unknown;
        output?: string;
      };
    };

/** 去掉 ANSI 转义序列（很多 CLI 报错时会带颜色码，直接展示会变成乱码）。 */
const ANSI_ESCAPE =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE, '');
}

/**
 * 把 pi 的模型错误（`message_end` 的 `errorMessage`）翻译成人话。
 * 失败必须有可读提示（验收项）——401 直接告诉用户去改哪里，而不是甩一段 JSON。
 */
export function humanizePiError(errorMessage: string): string {
  const detail = errorMessage.replace(/\s+/g, ' ').trim().slice(0, 300);
  const status = /^\s*(\d{3})\b/.exec(detail)?.[1];

  if (status === '401' || status === '403') {
    return `模型服务拒绝了请求（${status}）：pi 的 API key 不对或已过期，检查 ~/.pi/agent/models.json 里该 provider 的 apiKey。`;
  }
  if (status === '404') {
    return `接口或模型不存在（404）：检查 pi provider 的 baseUrl 与模型 id。${detail}`;
  }
  if (status === '429') {
    return '请求过于频繁或额度不足（429）：请稍后重试。';
  }
  return detail || '未知错误';
}

/**
 * 把 pi 的一行 JSON 事件映射成片段；不是事件（不是 JSON 或没有 type 字段）时返回 null。
 *
 * 注意：pi 的事件类型会增长（session / agent_start / turn_start / message_* /
 * turn_end / agent_end / tool_* …），所以**不做类型白名单**——凡是带 type 的 JSON
 * 行都当协议事件；只有 message_update 里的 delta 才是给用户看的内容，其余一律丢弃。
 * 否则新的事件类型会整段漏进正文（踩过：turn_end / agent_end）。
 *
 * 也被 RPC 模式复用（`lib/llm/piRpc.ts`）——两种模式共享同一套会话事件。
 */
export function parsePiEvent(line: string): AgentEvent[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;

  let event: {
    assistantMessageEvent?: {
      delta?: unknown;
      toolCall?: { arguments?: unknown; id?: unknown; name?: unknown };
      type?: unknown;
    };
    error?: { message?: unknown };
    message?: {
      content?: Array<{ text?: unknown; type?: unknown }>;
      details?: unknown;
      errorMessage?: unknown;
      isError?: unknown;
      role?: unknown;
      stopReason?: unknown;
      toolCallId?: unknown;
      toolName?: unknown;
    };
    type?: unknown;
  };
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof event?.type !== 'string') return null;

  if (event.type === 'message_update') {
    const update = event.assistantMessageEvent;

    // 工具调用：参数流完了（toolcall_end 带完整 arguments）
    if (update?.type === 'toolcall_end') {
      const call = update.toolCall;
      if (typeof call?.id === 'string' && typeof call.name === 'string') {
        return [
          {
            kind: 'tool',
            tool: {
              input: call.arguments,
              name: call.name,
              state: 'input-available',
              toolCallId: call.id,
            },
          },
        ];
      }
      return [];
    }

    const delta = typeof update?.delta === 'string' ? update.delta : '';
    if (!delta) return [];
    if (update?.type === 'thinking_delta') return [{ delta, kind: 'reasoning' }];
    if (update?.type === 'text_delta') return [{ delta, kind: 'text' }];
    return [];
  }

  // 工具结果：pi 会发一条 role=toolResult 的消息（message_end 是权威值）
  if (event.type === 'message_end' && event.message?.role === 'toolResult') {
    const { message } = event;
    if (typeof message.toolCallId !== 'string' || typeof message.toolName !== 'string') return [];

    const text = (message.content ?? [])
      .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
      .join('')
      .trim();
    const isError = message.isError === true;

    return [
      {
        kind: 'tool',
        tool: {
          // pi 扩展的 details（如 todo 的完整清单）——给 UI 渲染专属卡片
          details: message.details,
          errorText: isError ? text || '工具执行失败' : undefined,
          name: message.toolName,
          output: isError ? undefined : text.slice(0, 4000),
          state: isError ? 'output-error' : 'output-available',
          toolCallId: message.toolCallId,
        },
      },
    ];
  }

  // 模型出错：assistant 的 message_end 带 stopReason=error + errorMessage（如 key 失效的 401）。
  // 必须透出到正文，否则界面只剩一个空回复（踩过：401 静默，用户只看到"没有输出"）。
  if (event.type === 'message_end' && event.message?.role === 'assistant') {
    const { message } = event;
    if (typeof message.errorMessage === 'string' && message.errorMessage.trim()) {
      return [
        { delta: `\n\n> ⚠️ pi 调用模型失败：${humanizePiError(message.errorMessage)}`, kind: 'text' },
      ];
    }
    return [];
  }

  if (event.type === 'error') {
    const message =
      typeof event.error?.message === 'string' ? event.error.message : 'CLI 报告了一个错误';
    return [{ delta: `\n\n> 错误：${message}`, kind: 'text' }];
  }

  // 其它协议事件（session / turn_start / turn_end / message_start / agent_end …）不产生可见内容
  return [];
}
