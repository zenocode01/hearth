/**
 * 判定 CLI 命令是不是 pi —— **不依赖 node 模块**，客户端/服务端都能用
 * （`piTools.ts` 里有 fs 依赖，不能进客户端组件）。
 */

/**
 * 判断这个 CLI 命令是不是 pi（去掉 `KEY=value` 前缀后看第一个 token）。
 * 认 pi / pi.cmd / pi.exe / 路径里带 pi-coding-agent 的写法。
 */
export function isPiCommand(command: string | null | undefined): boolean {
  if (!command?.trim()) return false;

  const tokens = command.trim().split(/\s+/);
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  const first = tokens[index];
  if (!first) return false;

  const normalized = first.replaceAll('"', '').replaceAll("'", '').toLowerCase();
  const base = normalized.split(/[\\/]/).pop() ?? normalized;
  return (
    base === 'pi' ||
    base === 'pi.cmd' ||
    base === 'pi.exe' ||
    normalized.includes('pi-coding-agent')
  );
}

/** 命令是不是 pi 的 RPC 模式（会话树/导航命令都要走 RPC）。 */
export function isPiRpcCommand(command: string | null | undefined): boolean {
  return !!command && /--mode[=\s]+rpc\b/.test(command);
}
