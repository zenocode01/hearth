import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 外部 CLI agent 运行器（参考 refs 的 heterogeneous agents，取其最小可用子集）。
 *
 * 命令模板用占位符：
 *   {{prompt}}        —— 用户这次的输入（含对话历史）
 *   {{systemPrompt}}  —— Agent 的人设
 * 模板里没有 {{prompt}} 时，prompt 走 stdin。
 *
 * 注意：这里**不走 shell**——自己把模板拆成 argv 再 spawn，
 * 占位符作为独立参数传递，因此用户输入不会被当成 shell 语法执行。
 */

/** 把命令模板拆成 argv（支持单/双引号），占位符原样保留。 */
export function parseCommandTemplate(template: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (const char of template.trim()) {
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started || current) {
        tokens.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  if (started || current) tokens.push(current);

  return tokens;
}

/** 用 where 在 PATH 里找可执行文件（Windows 上 spawn 不认 .cmd，需要自己补扩展名）。 */
function findOnWindowsPath(file: string): string | null {
  try {
    const output = execFileSync('where.exe', [file], { encoding: 'utf8', windowsHide: true });
    const candidates = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const pick = (ext: string) => candidates.find((item) => item.toLowerCase().endsWith(ext));
    return pick('.exe') ?? pick('.cmd') ?? pick('.bat') ?? pick('.ps1') ?? null;
  } catch {
    return null;
  }
}

/**
 * npm 的 .cmd shim 里会执行包内的目标程序，把它抠出来：
 *   "…%dp0%\node_modules\…\cli.js"          → 用 node 跑
 *   "…%dp0%\node_modules\…\bin\xxx.exe"     → 直接跑 exe
 *
 * 注意：shim 里可能出现**多个** %dp0% 引用，且不一定都能用。踩过的坑：新版 pi 的 shim
 * 会先探测 `IF EXIST "%dp0%\node.exe"`（自带运行时），第一个匹配抓到的是这个不存在的
 * node.exe → 解析失败 → 兜底直接 spawn .cmd → EINVAL。所以：**全部抠出来，只挑磁盘上
 * 真实存在的**；有 .js/.mjs 就优先用它（说明是 node 包，交给当前 node 跑）。
 */
function targetFromCmdShim(cmdPath: string): { argsPrefix: string[]; file: string } | null {
  try {
    const content = readFileSync(cmdPath, 'utf8');
    const matches = [
      ...content.matchAll(/"?%dp0%[\\/]([^"]+?\.(?:exe|c?js|mjs))"?/gi),
    ]
      .map((match) => path.join(path.dirname(cmdPath), match[1].replaceAll('\\', path.sep)))
      .filter((target) => existsSync(target));

    const script = matches.find((target) => /\.(?:c?js|mjs)$/i.test(target));
    if (script) return { argsPrefix: [script], file: process.execPath };

    // 没有脚本 → 直接跑 exe（opencode 这类原生二进制）；跳过 shim 自己探测的 node.exe
    const binary = matches.find((target) => !path.basename(target).toLowerCase().startsWith('node.'));
    if (binary) return { argsPrefix: [], file: binary };

    return null;
  } catch {
    return null;
  }
}

/**
 * 把「用户在模板里写的命令名」解析成真正可 spawn 的 file + args。
 * Windows 上有两个坑：spawn 不补扩展名（npm 装出来的是 .cmd），而且 .cmd/.bat 不能直接 spawn。
 * 所以：.exe 直接跑；.cmd 从 shim 里解析出 node 脚本、用 node 跑；.ps1 用 powershell 跑。
 */
export function resolveCliCommand(file: string, args: string[]): { args: string[]; file: string } {
  if (process.platform !== 'win32') return { args, file };
  if (path.isAbsolute(file) || /[\\/]/.test(file)) return { args, file };

  const resolved = findOnWindowsPath(file) ?? file;
  const lower = resolved.toLowerCase();

  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    const target = targetFromCmdShim(resolved);
    if (target) return { args: [...target.argsPrefix, ...args], file: target.file };
    // Windows 不能直接 spawn .cmd/.bat（必 EINVAL）；解析不出来就明确报错，别让用户猜
    throw new Error(
      `无法解析 ${resolved} 里的启动目标（可能是新形态的 npm shim）。` +
        `可改用「node <包内 cli.js 的完整路径>」或直接写可执行文件路径`,
    );
  }
  if (lower.endsWith('.ps1')) {
    return {
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolved, ...args],
      file: 'powershell.exe',
    };
  }
  return { args, file: resolved };
}

/** 支持 `KEY=value` 前缀：等价于只给这次运行设环境变量（不需要 shell）。 */
function extractEnvPrefix(tokens: string[]): { env: Record<string, string>; rest: string[] } {
  const env: Record<string, string> = {};
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    const separator = tokens[index].indexOf('=');
    env[tokens[index].slice(0, separator)] = tokens[index].slice(separator + 1);
    index += 1;
  }
  return { env, rest: tokens.slice(index) };
}

/**
 * 展开模板里的 `%VAR%`（Windows 环境变量，大小写不敏感；找不到就保留原文）。
 * 只在**模板本身**上展开——占位符替换之后才是用户内容，顺序不能反，否则用户消息里的
 * `%xx%` 会被误伤。
 */
function expandEnvVars(token: string): string {
  return token.replaceAll(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (whole, name: string) => {
    const hit = Object.entries(process.env).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return hit?.[1] ?? whole;
  });
}

export interface CliRunOptions {
  command: string;
  prompt: string;
  signal?: AbortSignal;
  systemPrompt?: string | null;
}

/** 组装最终的 argv、stdin 与环境变量（占位符替换）。 */
export function buildCliInvocation({ command, prompt, systemPrompt }: CliRunOptions) {
  const persona = systemPrompt?.trim() ?? '';
  let usesPromptPlaceholder = false;

  const substitute = (token: string) => {
    if (token.includes('{{prompt}}')) usesPromptPlaceholder = true;
    return token.replaceAll('{{prompt}}', prompt).replaceAll('{{systemPrompt}}', persona);
  };

  const { env, rest } = extractEnvPrefix(parseCommandTemplate(command));
  const args = rest.map((token) => substitute(expandEnvVars(token)));
  if (args.length === 0) throw new Error('CLI 命令为空');

  const resolvedEnv = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, substitute(expandEnvVars(value))]),
  );

  return {
    args: args.slice(1),
    env: resolvedEnv,
    file: args[0],
    // 没用 {{prompt}} 占位符 → prompt 从 stdin 传（很多 CLI 支持）
    stdin: usesPromptPlaceholder ? null : prompt,
  };
}

/** CLI 输出的一个片段：正文 / 思考 / 工具调用。 */
export type CliChunk =
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
        errorText?: string;
        input?: unknown;
        output?: string;
      };
    };

/** 去掉 ANSI 转义序列（很多 CLI 报错时会带颜色码，直接展示会变成乱码）。 */
const ANSI_ESCAPE =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE, '');
}

/**
 * 把 pi 的一行 JSON 事件映射成片段；不是事件（不是 JSON 或没有 type 字段）时返回 null。
 *
 * 注意：pi 的事件类型会增长（session / agent_start / turn_start / message_* /
 * turn_end / agent_end / tool_* …），所以**不做类型白名单**——凡是带 type 的 JSON
 * 行都当协议事件；只有 message_update 里的 delta 才是给用户看的内容，其余一律丢弃。
 * 否则新的事件类型会整段漏进正文（踩过：turn_end / agent_end）。
 */
function parsePiEvent(line: string): CliChunk[] | null {
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
      isError?: unknown;
      role?: unknown;
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
          errorText: isError ? text || '工具执行失败' : undefined,
          name: message.toolName,
          output: isError ? undefined : text.slice(0, 4000),
          state: isError ? 'output-error' : 'output-available',
          toolCallId: message.toolCallId,
        },
      },
    ];
  }

  if (event.type === 'error') {
    const message =
      typeof event.error?.message === 'string' ? event.error.message : 'CLI 报告了一个错误';
    return [{ delta: `\n\n> 错误：${message}`, kind: 'text' }];
  }

  // 其它协议事件（session / turn_start / turn_end / message_start / agent_end …）不产生可见内容
  return [];
}

/** 收尾：把没有换行结尾的残留按当前协议处理（TS 看不到闭包内的赋值，故用参数传入）。 */
function finalizeChunk(value: string, mode: 'pi-json' | 'text' | 'unknown'): CliChunk[] {
  // pi-json 模式下残留也不是给用户看的内容
  if (mode === 'pi-json') return parsePiEvent(value) ?? [];
  return [{ delta: value, kind: 'text' }];
}

/** 失败时带上诊断信息（文件、参数概要、长度），便于定位 EINVAL/ENOENT 这类问题。 */
function describeCommand(file: string, args: string[]): string {
  const longest = args.reduce((max, arg) => Math.max(max, arg.length), 0);
  const preview = args
    .slice(0, 6)
    .map((arg) => (arg.length > 40 ? `${arg.slice(0, 40)}…` : arg))
    .join(', ');
  const more = args.length > 6 ? `, …共 ${args.length} 个` : '';
  return `file=${file}; args=[${preview}${more}]; 最长参数 ${longest} 字符`;
}

/** 运行 CLI，把 stdout 按「纯文本」或「pi JSONL 协议」解析成片段。 */
export async function* runCliAgent(options: CliRunOptions): AsyncGenerator<CliChunk> {
  const invocation = buildCliInvocation(options);
  const { args, file } = resolveCliCommand(invocation.file, invocation.args);
  const stdin = invocation.stdin;

  const detail = describeCommand(file, args);

  let child;
  try {
    child = spawn(file, args, {
      env: { ...process.env, ...invocation.env },
      shell: false,
      windowsHide: true,
    });
  } catch (error) {
    // spawn 遇到非法参数会**同步抛错**（如 EINVAL），这里补上上下文再抛出
    throw new Error(`启动命令失败：${(error as Error).message}（${detail}）`);
  }

  const kill = () => child.kill();
  options.signal?.addEventListener('abort', kill, { once: true });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += stripAnsi(chunk.toString());
  });

  if (stdin) {
    child.stdin.write(stdin);
    child.stdin.end();
  } else {
    child.stdin.end();
  }

  const queue: string[] = [];
  let done = false;
  let failure: Error | null = null;
  let notify: (() => void) | null = null;

  const wake = () => {
    notify?.();
    notify = null;
  };

  child.stdout.on('data', (chunk: Buffer) => {
    queue.push(chunk.toString());
    wake();
  });
  child.on('error', (error) => {
    failure = new Error(
      `无法启动命令「${invocation.file}」：${error.message}。请确认它已安装并在 PATH 中` +
        (process.platform === 'win32' ? `（可执行 where ${invocation.file} 检查）` : '') +
        `（${detail}）`,
    );
    done = true;
    wake();
  });
  child.on('close', (code) => {
    if (!failure && code !== 0) {
      failure = new Error(
        `命令退出码 ${code}${stderr.trim() ? `：${stderr.trim().slice(0, 500)}` : ''}`,
      );
    }
    done = true;
    wake();
  });

  // 输出解析状态机：先看第一行是不是 pi 的 JSONL 事件，认识就按协议解析，否则整条按纯文本
  let protocol: 'pi-json' | 'text' | 'unknown' = 'unknown';
  let buffer = '';

  function* processChunk(chunk: string): Generator<CliChunk> {
    if (protocol === 'text') {
      yield { delta: stripAnsi(chunk), kind: 'text' };
      return;
    }

    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      if (protocol === 'unknown') {
        const parsed = parsePiEvent(line);
        if (parsed) {
          protocol = 'pi-json';
          yield* parsed;
          continue;
        }
        // 第一行就不是已知事件 → 整个输出按纯文本处理
        protocol = 'text';
        yield { delta: `${line}\n`, kind: 'text' };
        if (buffer) {
          yield { delta: buffer, kind: 'text' };
          buffer = '';
        }
        continue;
      }

      const parsed = parsePiEvent(line);
      // pi-json 模式下正文只来自 message_update 的 delta；其它原始行（协议事件）一律丢弃
      if (parsed) yield* parsed;
    }
  }

  try {
    while (true) {
      while (queue.length > 0) yield* processChunk(queue.shift()!);
      if (failure) throw failure;
      if (done) break;
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
    }

    // 收尾：把没有换行结尾的残留吐出去
    if (buffer) {
      yield* finalizeChunk(buffer, protocol);
    }
  } finally {
    options.signal?.removeEventListener('abort', kill);
    if (!child.killed) child.kill();
  }
}

/** 把对话历史 + 本次输入（必要时带上人设）拼成一段给 CLI 的文本。 */
export function buildCliPrompt(options: {
  history: Array<{ content: string; role: 'assistant' | 'user' }>;
  question: string;
  /** 命令模板里没有 {{systemPrompt}} 时传人设，会并进 prompt 开头 */
  systemPrompt?: string | null;
}): string {
  const { history, question, systemPrompt } = options;
  const recent = history.slice(-10);
  const sections: string[] = [];

  if (systemPrompt?.trim()) {
    sections.push(`你的角色设定：${systemPrompt.trim()}`);
  }

  if (recent.length > 0) {
    sections.push(
      [
        '以下是此前的对话记录：',
        recent
          .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`)
          .join('\n'),
      ].join('\n'),
    );
  }

  sections.push(recent.length > 0 ? `现在用户说：\n${question}` : question);

  return sections.join('\n\n');
}
