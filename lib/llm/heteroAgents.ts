/**
 * 本地异构 CLI 智能体的**描述符目录**（学 LobeHub 的 `HETEROGENEOUS_AGENT_CONFIGS`）。
 *
 * 单一事实来源：命令模板、图标、安装提示一处定义，**Agent 编辑页的预设与"安装检测"都读它**，
 * 避免"界面写一套、实际另一套"。
 *
 * 只覆盖本地 CLI（不做 device / gateway / 云沙箱 / 多 agent 能力矩阵——家用配方用不到）。
 *
 * 注意：本文件**不 import node 内置模块**，客户端组件（Agent 编辑页）也能安全引用；
 * 真正去 PATH 里探测可执行文件的 `detectCliExecutable` 在 `lib/llm/cliDetect.ts`（服务端专用）。
 */

export interface HeteroCliAgent {
  /** 命令模板（含 `{{prompt}}` / `{{systemPrompt}}` 占位符） */
  command: string;
  /** 图标 key，对应 `features/agent/agentIcons.tsx` 的品牌图标 */
  iconKey: string;
  /** 检测不到可执行文件时给用户看的安装提示 */
  installHint: string;
  /** UI 补充说明（可选） */
  note?: string;
  /** 展示名 */
  title: string;
  /** 稳定标识，如 `pi` / `opencode` / `claude-code` */
  type: string;
}

export const HETERO_CLI_AGENTS: HeteroCliAgent[] = [
  {
    command: 'pi --mode rpc --system-prompt "{{systemPrompt}}"',
    iconKey: 'pi',
    installHint: 'npm i -g @earendil-works/pi-coding-agent',
    note: 'RPC 模式：支持 pi 扩展的交互（question 提问等），提示词走 RPC 命令',
    title: 'Pi',
    type: 'pi',
  },
  {
    // opencode 默认和桌面端共用数据目录会互抢（报「Database is not empty and has no session table」），
    // 用 XDG_DATA_HOME 给它一份独立数据目录；%LOCALAPPDATA% 由运行器展开
    command: 'XDG_DATA_HOME=%LOCALAPPDATA%\\hearth opencode run "{{prompt}}"',
    iconKey: 'opencode',
    installHint: '见 https://opencode.ai 的安装说明',
    title: 'OpenCode',
    type: 'opencode',
  },
  {
    command: 'claude -p --append-system-prompt "{{systemPrompt}}" "{{prompt}}"',
    iconKey: 'claude-code',
    installHint: 'npm i -g @anthropic-ai/claude-code',
    title: 'Claude Code',
    type: 'claude-code',
  },
];

/** 命令模板 → 可执行名：跳过 `KEY=value` 前缀，取第一个 token（去引号）。 */
export function cliExecutableOf(command: string): string | null {
  const tokens = command.trim().split(/\s+/);
  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue; // 环境变量前缀
    const clean = token.replace(/^["']|["']$/g, '');
    return clean || null;
  }
  return null;
}

/** 命令模板 → 命中的已知 agent（按可执行名匹配）；认不出返回 null。 */
export function heteroAgentOfCommand(command: string): HeteroCliAgent | null {
  const executable = cliExecutableOf(command);
  if (!executable) return null;
  const base = executable.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
  return HETERO_CLI_AGENTS.find((agent) => agent.iconKey === base || agent.type === base) ?? null;
}
