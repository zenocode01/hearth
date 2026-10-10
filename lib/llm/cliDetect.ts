/**
 * 外部 CLI 的「是否已安装」探测（服务端专用）。
 *
 * 与描述符目录（`lib/llm/heteroAgents.ts`，客户端可引用）分开：这里 import 了 node 内置模块，
 * 只能在服务端（API 路由）用。
 */
import { execFileSync } from 'node:child_process';

/**
 * 在 PATH 里找可执行文件，找到返回路径，否则 null（跨平台：Windows 用 `where`，其余 `which`）。
 * 只做"有没有装"的判断——真正的 spawn 仍走 `lib/llm/cli.ts` 的命令解析。
 */
export function detectCliExecutable(name: string): string | null {
  const tool = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const output = execFileSync(tool, [name], { encoding: 'utf8', windowsHide: true });
    return (
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0] ?? null
    );
  } catch {
    return null;
  }
}
