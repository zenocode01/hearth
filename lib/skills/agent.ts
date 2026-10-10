/**
 * 把技能接进对话：给模型一个「技能目录」，命中后再加载正文。
 *
 * - `buildSkillsPrompt`：拼 `<available_skills>`（只含 name/description，不含正文），
 *   注入到 system prompt / CLI prompt；正文等模型自己按需拉取（渐进式披露，省 token）。
 * - `buildSkillTools`：内置模型用的 `activate_skill`（读 SKILL.md 正文）+
 *   `read_skill_reference`（读 references/*）。外部 CLI（pi）不用这两个工具——
 *   它有 read 工具，prompt 里给了 SKILL.md 的绝对路径即可。
 */
import { jsonSchema, tool } from 'ai';

import { findSkill, readSkillResource, type SkillInfo } from './store';

/** 技能目录提示词；没有技能时返回空串（不注入）。 */
export function buildSkillsPrompt(
  skills: SkillInfo[],
  opts: { includePaths?: boolean } = {},
): string {
  if (skills.length === 0) return '';

  const lines = skills.map((skill) => {
    const desc = skill.description || '(无描述)';
    return opts.includePaths
      ? `- ${skill.name}：${desc}（SKILL.md: ${skill.file}）`
      : `- ${skill.name}（id: ${skill.id}）：${desc}`;
  });

  const how = opts.includePaths
    ? '当某个技能与用户请求相关时，用你的 read 工具读取它的 SKILL.md，再按里面的说明动手。'
    : '当某个技能与用户请求相关时，先用 activate_skill 加载它，再按里面的说明动手。';

  return ['<available_skills>', ...lines, '</available_skills>', '', how].join('\n');
}

/**
 * 内置模型用的技能工具。没有技能时返回空对象（不注册，别让模型看到无用的工具）。
 */
export function buildSkillTools(skills: SkillInfo[]): Record<string, unknown> {
  if (skills.length === 0) return {};
  const ids = skills.map((skill) => skill.id).join(', ');

  return {
    activate_skill: tool({
      description: `加载一个技能的完整说明（SKILL.md 正文 + 资源清单）。可用技能 id：${ids}。当用户请求与某个技能相关时，先调用它再动手。`,
      inputSchema: jsonSchema<{ name: string }>({
        additionalProperties: false,
        properties: { name: { description: '技能 id（见 available_skills 列表）', type: 'string' } },
        required: ['name'],
        type: 'object',
      }),
      execute: async ({ name }) => {
        const skill = findSkill(name);
        if (!skill) throw new Error(`没有这个技能：${name}（可用：${ids}）`);
        return { content: skill.content, name: skill.name, resources: skill.resources };
      },
    }),

    read_skill_reference: tool({
      description:
        '读取某个技能里的资源文件（如 references/xxx.md）。先 activate_skill 看它有哪些资源。',
      inputSchema: jsonSchema<{ path: string; skill: string }>({
        additionalProperties: false,
        properties: {
          path: { description: '资源文件相对路径，例如 references/commands.md', type: 'string' },
          skill: { description: '技能 id', type: 'string' },
        },
        required: ['path', 'skill'],
        type: 'object',
      }),
      execute: async ({ path: relative, skill }) => {
        const text = readSkillResource(skill, relative);
        if (text === null) throw new Error(`读不到资源：${skill}/${relative}`);
        return { path: relative, skill, text: text.slice(0, 8000), truncated: text.length > 8000 };
      },
    }),
  };
}
