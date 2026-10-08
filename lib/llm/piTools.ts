import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * pi（外部 CLI Agent）的工具清单。
 *
 * 来源：pi 官方文档 `docs/settings.md#tools`（随包安装，可对照
 * `node_modules/@earendil-works/pi-coding-agent/docs/settings.md`）：
 *   Available built-in tools are `read`, `bash`, `powershell`, `edit`, `write`, `grep`, `find`, `ls`.
 *   `defaultTools` 默认 = `read`, `bash`, `edit`, `write`。
 *
 * **启用状态是实时读的**（`~/.pi/agent/settings.json` 的 `defaultTools`）；
 * 清单本身在 pi 升级新增工具时需要跟着更新（未知工具会原样展示，不至于丢）。
 */
const PI_BUILTIN_TOOLS: Array<{
  description: string;
  label: string;
  name: string;
  windowsOnly?: boolean;
}> = [
  { description: '读取文件内容（带行号，支持 offset / limit）', label: '读取文件', name: 'read' },
  { description: '执行命令（Windows 上经 Git Bash；本机没装 Bash 时用 PowerShell）', label: '执行命令', name: 'bash' },
  { description: '用 PowerShell 执行命令（仅 Windows 提供）', label: 'PowerShell', name: 'powershell', windowsOnly: true },
  { description: '精确替换文件内容（oldText → newText，必须唯一匹配）', label: '编辑文件', name: 'edit' },
  { description: '写入 / 覆盖文件（自动创建父目录）', label: '写入文件', name: 'write' },
  { description: '按正则搜索文件内容（尊重 .gitignore）', label: '搜索内容', name: 'grep' },
  { description: '按 glob 查找文件（尊重 .gitignore）', label: '查找文件', name: 'find' },
  { description: '列出目录内容', label: '列目录', name: 'ls' },
];

/** pi 文档里的默认启用集合（settings.json 没写 defaultTools 时生效） */
const PI_DEFAULT_TOOLS = ['read', 'bash', 'edit', 'write'];

export interface PiToolInfo {
  description: string;
  enabled: boolean;
  label: string;
  name: string;
}

function settingsFilePath(): string {
  return path.join(homedir(), '.pi', 'agent', 'settings.json');
}

/** 读 pi 的 settings.json（读不到 / 坏了就当没设置）。 */
function readPiSettings(): { defaultTools?: string[]; settingsPath: string } {
  const settingsPath = settingsFilePath();
  try {
    if (!existsSync(settingsPath)) return { settingsPath };
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as { defaultTools?: unknown };
    if (Array.isArray(parsed.defaultTools)) {
      return {
        defaultTools: parsed.defaultTools.filter((item): item is string => typeof item === 'string'),
        settingsPath,
      };
    }
    return { settingsPath };
  } catch {
    return { settingsPath };
  }
}

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
  return base === 'pi' || base === 'pi.cmd' || base === 'pi.exe' || normalized.includes('pi-coding-agent');
}

/** pi 的工具清单 + 实时启用状态（从 ~/.pi/agent/settings.json 读）。 */
export function listPiTools(): {
  enabledTools: string[];
  settingsPath: string;
  tools: PiToolInfo[];
} {
  const { defaultTools, settingsPath } = readPiSettings();
  const enabled = defaultTools ?? PI_DEFAULT_TOOLS;
  const enabledSet = new Set(enabled);

  return {
    enabledTools: enabled,
    settingsPath,
    tools: PI_BUILTIN_TOOLS.map((tool) => ({
      description: tool.description,
      enabled: enabledSet.has(tool.name),
      label: tool.label,
      name: tool.name,
    })),
  };
}
