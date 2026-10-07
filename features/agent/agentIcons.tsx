'use client';

import {
  Amp,
  ClaudeCode,
  Cline,
  CodeBuddy,
  Codex,
  Cursor,
  Devin,
  Grok,
  Kimi,
  OpenCode,
  Pi,
  Qoder,
  Trae,
} from '@lobehub/icons';

/**
 * 品牌头像：Agent 的 `avatar` 存 `icon:<key>`（如 `icon:opencode`）时渲染对应外部 Agent 的
 * logo。图标来自 `@lobehub/icons`（MIT），清单参考 refs 里 heterogeneous-agents 的映射。
 */
export const ICON_AVATAR_PREFIX = 'icon:';

/** 各品牌图标的复合类型结构一致（Mono + Avatar/Combine/Text…），拿 Pi 的类型统一表示 */
type BrandIcon = typeof Pi;

export interface AgentIconOption {
  Icon: BrandIcon;
  key: string;
  label: string;
}

export const AGENT_ICON_OPTIONS: AgentIconOption[] = [
  { Icon: Pi, key: 'pi', label: 'Pi' },
  { Icon: OpenCode, key: 'opencode', label: 'OpenCode' },
  { Icon: ClaudeCode, key: 'claude-code', label: 'Claude Code' },
  { Icon: Codex, key: 'codex', label: 'Codex' },
  { Icon: Cursor, key: 'cursor', label: 'Cursor' },
  { Icon: Cline, key: 'cline', label: 'Cline' },
  { Icon: Amp, key: 'amp', label: 'Amp' },
  { Icon: Trae, key: 'trae', label: 'Trae' },
  { Icon: Kimi, key: 'kimi', label: 'Kimi' },
  { Icon: Qoder, key: 'qoder', label: 'Qoder' },
  { Icon: CodeBuddy, key: 'codebuddy', label: 'CodeBuddy' },
  { Icon: Devin, key: 'devin', label: 'Devin' },
  { Icon: Grok, key: 'grok', label: 'Grok' },
];

/** `icon:<key>` → 对应品牌图标配置；不是品牌头像或 key 不认识时返回 null。 */
export function getAgentIconOption(avatar?: string | null): AgentIconOption | null {
  if (!avatar?.startsWith(ICON_AVATAR_PREFIX)) return null;
  const key = avatar.slice(ICON_AVATAR_PREFIX.length);
  return AGENT_ICON_OPTIONS.find((option) => option.key === key) ?? null;
}
