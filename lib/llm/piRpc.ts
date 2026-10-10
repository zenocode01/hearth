import { spawn } from 'node:child_process';

import { parsePiEvent, type AgentEvent } from './agentEvents';
import { buildCliInvocation, resolveCliCommand } from './cli';
import { checkPiRuntime, piEnvExtra } from './piEnv';
import { normalizeReasoningEffort } from './reasoning';

/**
 * pi 的 **RPC 模式**运行器（`pi --mode rpc`）。
 *
 * 与 json 模式的区别：
 * - 提示词不放在命令行/stdin 文本里，而是发一条 `{"type":"prompt","message":…}` RPC 命令；
 * - 扩展的交互（`ctx.ui.select` / `input` / `confirm`，如 question 扩展）会以
 *   `extension_ui_request` 发出来，**等客户端回答**后再继续（json 模式没有 UI，扩展直接报错）；
 * - 会话事件与 json 模式相同（复用 `parsePiEvent`），`agent_settled` 表示这一轮结束。
 *
 * 注意：命令模板里**不要用 `{{prompt}}`**（提示词走 RPC 命令），否则报错提示。
 */
export interface QuestionRequest {
  id: string;
  method: 'confirm' | 'editor' | 'input' | 'select';
  options?: string[];
  placeholder?: string;
  title: string;
}

export interface QuestionAnswer {
  cancelled?: boolean;
  /** confirm 用 true/false；select/input 用字符串 */
  value?: string | boolean;
}

export interface PiRpcOptions {
  /** 当前轮的图片附件（base64）。pi 的 prompt 命令支持 images，见 ImageContent */
  images?: Array<{ data: string; mediaType: string }>;
  /** 需要用户输入时调用；不传或抛错 → 视为取消 */
  askUser?: (question: QuestionRequest) => Promise<QuestionAnswer>;
  command: string;
  prompt: string;
  /**
   * 思考等级（off/low/medium/high/xhigh）。发 prompt 之前先发一条
   * `set_thinking_level` RPC 命令；空 = 用 pi 自己的默认（我们隔离环境里是 medium）。
   * 差别很大：实测 high 36 秒 vs medium 12 秒。
   */
  reasoningEffort?: string | null;
  signal?: AbortSignal;
  systemPrompt?: string | null;
}

const DIALOG_METHODS = new Set(['confirm', 'editor', 'input', 'select']);

/** 运行 pi（RPC 模式），把会话事件与工具事件解析成片段。 */
export async function* runPiRpcAgent(options: PiRpcOptions): AsyncGenerator<AgentEvent> {
  const invocation = buildCliInvocation({
    command: options.command,
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
  });
  if (invocation.usesPromptPlaceholder) {
    throw new Error(
      'RPC 模式的命令模板不要用 {{prompt}}（提示词通过 RPC 命令发送）。示例：pi --mode rpc --system-prompt "{{systemPrompt}}"',
    );
  }
  const promptText = invocation.stdin ?? options.prompt;

  const { args, file } = resolveCliCommand(invocation.file, invocation.args);

  // 隔离环境没准备好就**早失败**，别让 pi 吐一堆英文 provider 错误
  const runtime = checkPiRuntime();
  if (!runtime.ok) throw new Error(runtime.error ?? '项目内 pi 环境未就绪');

  const child = spawn(file, args, {
    env: { ...process.env, ...invocation.env, ...piEnvExtra() },
    shell: false,
    windowsHide: true,
  });

  const kill = () => child.kill();
  options.signal?.addEventListener('abort', kill, { once: true });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // 发起这一轮的提示词
  // pi 的 RPC prompt 命令支持 images：`{ type:'image', mimeType, data:<base64> }`
  // （ImageContent.data 是 base64 字符串）。不带图时不要带这个字段。
  const images = (options.images ?? []).map((image) => ({
    data: image.data,
    mimeType: image.mediaType,
    type: 'image' as const,
  }));

  // 思考等级：**必须排在 prompt 之前**（stdin 是有序的，pi 按行处理命令）。
  // 非法档位已在 normalizeReasoningEffort 过滤；pi 侧可用档位是
  // low/medium/high/xhigh（get_available_thinking_levels），off 也能设成功只是不在列表里。
  const effort = normalizeReasoningEffort(options.reasoningEffort);
  if (effort) {
    child.stdin.write(`${JSON.stringify({ level: effort, type: 'set_thinking_level' })}\n`);
  }

  child.stdin.write(
    `${JSON.stringify({ images: images.length > 0 ? images : undefined, message: promptText, type: 'prompt' })}\n`,
  );

  const queue: Array<
    | { event: { id: string; method: string; options?: string[]; placeholder?: string; title?: string }; kind: 'dialog' }
    | { kind: 'line'; line: string }
  > = [];
  let done = false;
  let failure: Error | null = null;
  let notify: (() => void) | null = null;
  const wake = () => {
    notify?.();
    notify = null;
  };

  /** 扩展的对话请求 → 交给上层（UI）回答，再写回 pi */
  const handleDialog = async (event: {
    id: string;
    method: string;
    options?: string[];
    placeholder?: string;
    title?: string;
  }) => {
    let answer: QuestionAnswer = { cancelled: true };
    try {
      answer =
        (await options.askUser?.({
          id: event.id,
          method: event.method as QuestionRequest['method'],
          options: event.options,
          placeholder: event.placeholder,
          title: event.title ?? '',
        })) ?? { cancelled: true };
    } catch {
      answer = { cancelled: true };
    }

    const response =
      event.method === 'confirm'
        ? { confirmed: answer.value === true, id: event.id, type: 'extension_ui_response' }
        : answer.cancelled || answer.value === undefined
          ? { cancelled: true, id: event.id, type: 'extension_ui_response' }
          : { id: event.id, type: 'extension_ui_response', value: answer.value };

    try {
      child.stdin.write(`${JSON.stringify(response)}\n`);
    } catch {
      /* pi 可能已经退出 */
    }
  };

  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      let event: { id?: unknown; method?: unknown; type?: unknown } | null = null;
      try {
        event = JSON.parse(line) as { id?: unknown; method?: unknown; type?: unknown };
      } catch {
        event = null;
      }

      // 扩展的 UI 请求：对话方法要回答（**入队按序处理**，保证工具事件先被消费掉，
      // 否则上层还没看到 question 工具调用，awaiting 标记就会挂错地方）；
      // 其余（notify/setWidget…）忽略
      if (event?.type === 'extension_ui_request' && typeof event.method === 'string') {
        if (DIALOG_METHODS.has(event.method) && typeof event.id === 'string') {
          queue.push({ event: event as { id: string; method: string }, kind: 'dialog' });
        }
        continue;
      }

      queue.push({ kind: 'line', line });

      if (event?.type === 'agent_settled') done = true;
    }

    // 每收到一段 stdout 都要唤醒消费者。踩过的坑：只在 agent_settled / dialog 时 wake，
    // 普通增量（message_update）会一直攒在队列里，直到这一轮结束才被消费——用户看到的就是
    // "pi 跑完一整个 loop 才一次性把内容全显示出来"。cli.ts 的非 RPC 分支就是每段都 wake。
    wake();
  });

  child.on('error', (error) => {
    failure = new Error(`无法启动命令「${invocation.file}」：${error.message}`);
    done = true;
    wake();
  });
  child.on('close', (code) => {
    if (!failure && !done && code !== 0) {
      failure = new Error(
        `命令退出码 ${code}${stderr.trim() ? `：${stderr.trim().slice(0, 500)}` : ''}`,
      );
    }
    done = true;
    wake();
  });

  try {
    while (true) {
      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.kind === 'dialog') {
          // 等用户回答（上层负责把问题写进聊天流并等浏览器提交）
          await handleDialog(item.event);
          continue;
        }
        const parsed = parsePiEvent(item.line);
        if (parsed) yield* parsed;
      }
      if (failure) throw failure;
      if (done) break;
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
    }
  } finally {
    options.signal?.removeEventListener('abort', kill);
    if (!child.killed) child.kill();
  }
}
