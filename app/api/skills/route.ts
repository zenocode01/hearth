import { SKILLS_DIR, listSkills } from '@/lib/skills/store';

/**
 * GET /api/skills —— 本地技能列表（含 SKILL.md 正文，技能都很小）。
 *
 * 技能来自文件系统（默认 `data/skills/`），不是 DB——所以这里只读，没有增删改。
 */
export function GET() {
  return Response.json({
    dir: SKILLS_DIR,
    skills: listSkills().map((skill) => ({
      content: skill.content,
      description: skill.description,
      id: skill.id,
      name: skill.name,
      resources: skill.resources,
    })),
  });
}
