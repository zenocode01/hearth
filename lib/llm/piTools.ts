import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * pi（外部 CLI Agent）的工具清单。三路合并，尽量"实时"：
 *
 * 1. **内置工具**：pi 文档 `docs/settings.md#tools`（read/bash/powershell/edit/write/grep/find/ls），
 *    启用状态实时读 `~/.pi/agent/settings.json` 的 `defaultTools`。
 * 2. **广告中的工具**（含 npm 扩展）：pi 把可用工具写进 system message 的 `<tools>` 段
 *    （`- name: 描述`），而这条消息会持久化在会话文件里 —— 读**最近一次会话**即可，
 *    不用跑模型。这些工具都是启用状态。
 * 3. **本地扩展工具**（不广告的，如用户自装的 todo / question）：扫
 *    `~/.pi/agent/extensions/*.ts` 里的 `registerTool({ name: "…" })`（只认字面量名）。
 *
 * 合并顺序：内置 → 会话里广告的（补进扩展）→ 本地扩展（补缺）。
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
  /** 是否启用（内置看 settings；扩展工具已注册即可用） */
  enabled: boolean;
  label: string;
  name: string;
  source: 'builtin' | 'extension';
}

export interface PiToolList {
  /** 广告中的工具来源会话文件（给 UI 展示"数据来自哪次运行"） */
  advertisedFrom: string | null;
  enabledTools: string[];
  settingsPath: string;
  tools: PiToolInfo[];
}

function agentDir(): string {
  return path.join(homedir(), '.pi', 'agent');
}

/** 读 pi 的 settings.json（读不到 / 坏了就当没设置）。 */
function readPiSettings(): { defaultTools?: string[]; settingsPath: string } {
  const settingsPath = path.join(agentDir(), 'settings.json');
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

/** 找最近修改过的会话文件（广告工具清单的来源）。 */
function latestSessionFile(): string | null {
  const root = path.join(agentDir(), 'sessions');
  try {
    if (!existsSync(root)) return null;
    const files: Array<{ mtime: number; path: string }> = [];

    const walk = (dir: string, depth: number) => {
      if (depth > 4) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        if (!entry.name.endsWith('.jsonl')) continue;
        const stat = statSync(full);
        if (stat.size > 5 * 1024 * 1024) continue;
        files.push({ mtime: stat.mtimeMs, path: full });
      }
    };
    walk(root, 0);

    files.sort((a, b) => b.mtime - a.mtime);
    return files[0]?.path ?? null;
  } catch {
    return null;
  }
}

/** 从会话文件里抠出 system message 的 `<tools>` 段（`- name: 描述`）。 */
function readAdvertisedTools(): { from: string | null; tools: PiToolInfo[] } {
  const file = latestSessionFile();
  if (!file) return { from: null, tools: [] };

  try {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.includes('<tools>') || !line.includes('"sections"')) continue;
      const parsed = JSON.parse(line) as { message?: { sections?: { tools?: unknown } } };
      const text = parsed.message?.sections?.tools;
      if (typeof text !== 'string') continue;

      const tools: PiToolInfo[] = [];
      for (const match of text.matchAll(/^- ([a-zA-Z0-9_]+):\s*(.+)$/gm)) {
        tools.push({
          description: match[2].trim().slice(0, 240),
          enabled: true,
          label: match[1],
          name: match[1],
          source: 'extension',
        });
      }
      return { from: file, tools };
    }
  } catch {
    /* 读不到就当没有 */
  }

  return { from: file, tools: [] };
}

/** 扫本地扩展源码里的 `registerTool({ name: "…" })`（只认字面量，够覆盖自建扩展）。 */
function readLocalExtensionTools(): PiToolInfo[] {
  const dir = path.join(agentDir(), 'extensions');
  try {
    if (!existsSync(dir)) return [];
    const tools: PiToolInfo[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(ts|js|mjs)$/.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (statSync(full).size > 1024 * 1024) continue;
      const content = readFileSync(full, 'utf8');

      for (const match of content.matchAll(
        /registerTool\s*(?:<[^>]*>)?\s*\(\s*\{[\s\S]{0,400}?name:\s*["']([^"']+)["']([\s\S]{0,600})/g,
      )) {
        const name = match[1];
        const window = match[2] ?? '';
        const label = /label:\s*["']([^"']+)["']/.exec(window)?.[1];
        const description = /description:\s*(?:["'`])([^"'`]{0,200})/.exec(window)?.[1];
        tools.push({
          description: description?.trim() ?? '来自 pi 扩展',
          enabled: true,
          label: label?.trim() ?? name,
          name,
          source: 'extension',
        });
      }
    }
    return tools;
  } catch {
    return [];
  }
}

/** pi 的工具清单：内置 + 会话里广告的 + 本地扩展，合并去重。 */
export function listPiTools(): PiToolList {
  const { defaultTools, settingsPath } = readPiSettings();
  const enabled = defaultTools ?? PI_DEFAULT_TOOLS;
  const enabledSet = new Set(enabled);

  const merged = new Map<string, PiToolInfo>();
  for (const tool of PI_BUILTIN_TOOLS) {
    merged.set(tool.name, {
      description: tool.description,
      enabled: enabledSet.has(tool.name),
      label: tool.label,
      name: tool.name,
      source: 'builtin',
    });
  }

  const advertised = readAdvertisedTools();
  for (const tool of advertised.tools) {
    if (merged.has(tool.name)) continue; // 内置的保留我们自己的中文描述
    merged.set(tool.name, tool);
  }

  for (const tool of readLocalExtensionTools()) {
    if (merged.has(tool.name)) continue;
    merged.set(tool.name, tool);
  }

  return {
    advertisedFrom: advertised.from,
    enabledTools: enabled,
    settingsPath,
    tools: [...merged.values()],
  };
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
