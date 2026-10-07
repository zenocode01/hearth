/** Agent 表单输入的归一化（路由文件不能导出额外函数，故独立成模块）。 */
export interface AgentInput {
  avatar?: string;
  model?: string;
  name?: string;
  systemPrompt?: string;
  temperature?: number | null;
}

export function normalizeAgentInput(input: AgentInput) {
  return {
    avatar: input.avatar?.trim() || '😀',
    model: input.model?.trim() || null,
    name: (input.name ?? '').trim().slice(0, 40) || '未命名 Agent',
    systemPrompt: input.systemPrompt?.trim() || null,
    temperature:
      typeof input.temperature === 'number' && Number.isFinite(input.temperature)
        ? input.temperature
        : null,
  };
}

/**
 * PATCH 用：只归一化**显式提供**的字段，未提供的保持原值。
 * （用 normalizeAgentInput 会把没传的字段重置成默认值——只改人设会把名字/头像冲掉。）
 */
export function normalizeAgentPatch(input: AgentInput) {
  const patch: {
    avatar?: string;
    model?: string | null;
    name?: string;
    systemPrompt?: string | null;
    temperature?: number | null;
  } = {};

  if (input.avatar !== undefined) patch.avatar = input.avatar?.trim() || '😀';
  if (input.model !== undefined) patch.model = input.model?.trim() || null;
  if (input.name !== undefined) patch.name = (input.name ?? '').trim().slice(0, 40) || '未命名 Agent';
  if (input.systemPrompt !== undefined) patch.systemPrompt = input.systemPrompt?.trim() || null;
  if (input.temperature !== undefined) {
    patch.temperature =
      typeof input.temperature === 'number' && Number.isFinite(input.temperature)
        ? input.temperature
        : null;
  }

  return patch;
}
