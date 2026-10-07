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

/** npm 的 .cmd shim 里会执行 `node <包内脚本> %*`，把那个脚本路径抠出来。 */
function scriptFromCmdShim(cmdPath: string): string | null {
  try {
    const content = readFileSync(cmdPath, 'utf8');
    const match = content.match(/"?%dp0%[\\/]([^"]+?\.(?:c?js|mjs))"?/i);
    if (!match) return null;
    const script = path.join(path.dirname(cmdPath), match[1].replaceAll('\\', path.sep));
    return existsSync(script) ? script : null;
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
    const script = scriptFromCmdShim(resolved);
    if (script) return { args: [script, ...args], file: process.execPath };
    return { args, file: resolved };
  }
  if (lower.endsWith('.ps1')) {
    return {
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolved, ...args],
      file: 'powershell.exe',
    };
  }
  return { args, file: resolved };
}

export interface CliRunOptions {
  command: string;
  prompt: string;
  signal?: AbortSignal;
  systemPrompt?: string | null;
}

/** 组装最终的 argv 与 stdin（占位符替换）。 */
export function buildCliInvocation({ command, prompt, systemPrompt }: CliRunOptions) {
  const persona = systemPrompt?.trim() ?? '';
  let usesPromptPlaceholder = false;

  const args = parseCommandTemplate(command).map((token) => {
    if (token.includes('{{prompt}}')) usesPromptPlaceholder = true;
    return token
      .replaceAll('{{prompt}}', prompt)
      .replaceAll('{{systemPrompt}}', persona);
  });

  if (args.length === 0) throw new Error('CLI 命令为空');

  return {
    args: args.slice(1),
    file: args[0],
    // 没用 {{prompt}} 占位符 → prompt 从 stdin 传（很多 CLI 支持）
    stdin: usesPromptPlaceholder ? null : prompt,
  };
}

/** 运行 CLI，把 stdout 逐块吐出来（stderr 收集起来供报错）。 */
export async function* runCliAgent(options: CliRunOptions): AsyncGenerator<string> {
  const invocation = buildCliInvocation(options);
  const { args, file } = resolveCliCommand(invocation.file, invocation.args);
  const stdin = invocation.stdin;

  const child = spawn(file, args, {
    env: process.env,
    shell: false,
    windowsHide: true,
  });

  const kill = () => child.kill();
  options.signal?.addEventListener('abort', kill, { once: true });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
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
        (process.platform === 'win32' ? `（可执行 where ${invocation.file} 检查）` : ''),
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

  try {
    while (true) {
      while (queue.length > 0) yield queue.shift()!;
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
