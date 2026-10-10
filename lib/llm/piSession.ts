import { spawn } from 'node:child_process';

import { buildCliInvocation, resolveCliCommand } from './cli';
import { checkPiRuntime, piEnvExtra } from './piEnv';

/**
 * pi **会话管理**的一次性 RPC 客户端（`docs/rpc-commands.md`）。
 *
 * 与 `piRpc.ts`（跑一轮对话、流式产出事件）不同，这里解决的是"对**已有会话**做操作"：
 * 查看会话树、看状态/统计、在会话内跳转分支、手动压缩……这些都不是"发一轮 prompt"，
 * 而是单独的命令，且大多**不该**触发模型。
 *
 * 实现要点：每轮对话我们都是新起一个 pi 进程，会话靠 `--session-id` 从磁盘续上
 * （见 docs/analysis/pi-session-tree.md）。所以这里同样：带着同一个 `--session-id`
 * 起进程 → 按 id 发命令、收 `response` → 拿完结果就关。一次进程里可连发多条命令，
 * 省掉多次冷启动。
 */

export interface PiSessionRequest {
  /** 命令类型，如 get_state / get_tree / get_entries / compact / prompt … */
  type: string;
  [key: string]: unknown;
}

export interface PiSessionResponse {
  command?: string;
  data?: unknown;
  error?: string;
  success: boolean;
}

export interface PiSessionCallOptions {
  /** Agent 的 CLI 命令模板（须含 `--mode rpc`，与对话用的是同一条） */
  command: string;
  signal?: AbortSignal;
  /** 人设（与对话一致，保证 system prompt patch 是空操作） */
  systemPrompt?: string | null;
  timeoutMs?: number;
  /** 我们的 topic id = pi 的 session id */
  topicId: string;
}

/** 判断命令是不是 pi 的 RPC 模式（会话管理命令都要走 RPC）。 */
export function isPiRpcCommand(command: string | null | undefined): boolean {
  return !!command && /--mode[=\s]+rpc\b/.test(command);
}

/**
 * 对一个 pi 会话依次发送多条 RPC 命令，返回**按请求顺序**对齐的响应。
 * 任何一步失败都不抛（把 `error` 放在响应里，交给调用方决定怎么提示）。
 */
export async function runPiSessionCommands(
  options: PiSessionCallOptions & { requests: PiSessionRequest[] },
): Promise<PiSessionResponse[]> {
  const { command, requests, systemPrompt, topicId } = options;
  const invocation = buildCliInvocation({ command, prompt: '', systemPrompt });
  if (invocation.usesPromptPlaceholder) {
    throw new Error('会话管理命令要求 RPC 模式且模板里不要用 {{prompt}}。');
  }

  // 带上会话参数：与对话链路用同一个 session id（topic id）
  const { args, file } = resolveCliCommand(invocation.file, [
    ...invocation.args,
    '--session-id',
    topicId,
  ]);

  const runtime = checkPiRuntime();
  if (!runtime.ok) throw new Error(runtime.error ?? '项目内 pi 环境未就绪');

  const child = spawn(file, args, {
    env: { ...process.env, ...invocation.env, ...piEnvExtra() },
    shell: false,
    windowsHide: true,
  });

  const kill = () => child.kill();
  options.signal?.addEventListener('abort', kill, { once: true });

  const results: PiSessionResponse[] = [];
  const pending = new Map<string, (response: PiSessionResponse) => void>();
  let finish = () => {};

  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let record: { id?: unknown; type?: unknown } & Record<string, unknown>;
      try {
        record = JSON.parse(line) as typeof record;
      } catch {
        continue;
      }
      // 命令响应：按 id 配对（pi 的命令是异步的，不能靠顺序）
      if (record.type === 'response' && typeof record.id === 'string') {
        const resolve = pending.get(record.id);
        if (resolve) {
          pending.delete(record.id);
          resolve(record as unknown as PiSessionResponse);
          if (pending.size === 0) finish();
        }
      }
    }
  });

  child.on('error', () => finish());
  child.on('close', () => finish());

  // 每条命令分配一个 id；收到全部响应（或进程退出/超时）就结束
  requests.forEach((request, index) => {
    const id = `hearth-${index}`;
    pending.set(id, (response) => {
      results[index] = response;
    });
    child.stdin.write(`${JSON.stringify({ id, ...request })}\n`);
  });

  const timeoutMs = options.timeoutMs ?? 30_000;
  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let finished = false;
    const settle = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      resolve();
    };
    // 全部响应到齐 / 进程退出（child.on close → finish）/ 超时，任一发生就收工
    finish = settle;
    if (pending.size === 0) {
      settle();
      return;
    }
    timer = setTimeout(settle, timeoutMs);
    poll = setInterval(() => {
      if (pending.size === 0) settle();
    }, 50);
  });

  options.signal?.removeEventListener('abort', kill);
  if (!child.killed) child.kill();

  return requests.map(
    (_request, index) =>
      results[index] ?? { error: 'pi 未返回响应（进程提前退出或超时）', success: false },
  );
}

/** 会话树节点（`get_tree` 返回的形态，我们只取需要的字段）。 */
export interface PiSessionTreeNode {
  children?: PiSessionTreeNode[];
  entry?: {
    id?: string;
    message?: { content?: unknown; role?: string };
    parentId?: string | null;
    type?: string;
  };
  label?: string;
}

export interface PiSessionSnapshot {
  /** 可供分支的 user 消息（entryId + 文本），来自 `get_fork_messages` */
  forkMessages: Array<{ entryId: string; text: string }>;
  leafId: string | null;
  /** `get_state` 的原始返回（含 sessionId / messageCount / thinkingLevel…） */
  state: unknown;
  tree: PiSessionTreeNode[];
}

/** 读一个 pi 会话的快照：状态 + 会话树 + 可分支的 user 消息。 */
export async function readPiSession(options: PiSessionCallOptions): Promise<PiSessionSnapshot> {
  const [stateRes, treeRes, forkRes] = await runPiSessionCommands({
    ...options,
    requests: [{ type: 'get_state' }, { type: 'get_tree' }, { type: 'get_fork_messages' }],
  });

  const treeData = treeRes.data as
    | { leafId?: string | null; tree?: PiSessionTreeNode[] }
    | undefined;
  const forkData = forkRes.data as
    | { messages?: Array<{ entryId: string; text: string }> }
    | undefined;

  return {
    forkMessages: forkData?.messages ?? [],
    leafId: treeData?.leafId ?? null,
    state: stateRes.data ?? null,
    tree: treeData?.tree ?? [],
  };
}

/**
 * 在会话内从某条 entry 处开兄弟分支：走我们自研扩展注册的 `/hearth-navigate` 命令。
 * （pi 的 RPC 没有 leaf 导航命令，扩展补上；带 label 落盘，跨进程可续。）
 */
export async function navigatePiSession(
  options: PiSessionCallOptions & { entryId: string },
): Promise<PiSessionResponse> {
  const [response] = await runPiSessionCommands({
    ...options,
    requests: [{ message: `/hearth-navigate ${options.entryId}`, type: 'prompt' }],
  });
  return response;
}
