/**
 * Agent Skills（技能）——本地技能发现与读取。
 *
 * 一个技能 = 一个目录，根目录放 `SKILL.md`（YAML frontmatter + Markdown 正文），
 * 可带 `references/` 等资源。学 LobeHub 的 Agent Skills（`packages/builtin-skills` +
 * `builtin-tool-skills`），但只取最小形态：
 *
 * - 只读本地目录（默认 `data/skills/`，env `HEARTH_SKILLS_DIR` 可改；不入 git）；
 * - 模型只看得到「目录」（name + description），命中后才用 `activate_skill` 读正文
 *   （渐进式披露，正文不白白占 token）；
 * - 不引入市场 / DB / 权限体系（那是重型基建）。
 *
 * frontmatter 只认 `name` / `description` 两个字段，自己用正则解析（不引 yaml 依赖）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export interface SkillInfo {
  /** 正文（已去掉 frontmatter） */
  content: string;
  /** 一句话描述（模型据此判断要不要用） */
  description: string;
  /** SKILL.md 的绝对路径（外部 CLI 可直接 read 它） */
  file: string;
  /** 目录名，也是 `activate_skill` 用的 id */
  id: string;
  /** 展示名（frontmatter.name，缺省用目录名） */
  name: string;
  /** 资源文件相对路径（references/ 等，不含 SKILL.md） */
  resources: string[];
}

export const SKILLS_DIR =
  process.env.HEARTH_SKILLS_DIR?.trim() || path.join(process.cwd(), 'data', 'skills');

/** 拆 frontmatter（`---` 块）与正文；只取 name/description，其余字段忽略。 */
function parseSkill(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { body: raw.trim(), data: {} };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (entry) data[entry[1].toLowerCase()] = entry[2].replace(/^["']|["']$/g, '').trim();
  }
  return { body: raw.slice(match[0].length).trim(), data };
}

/** 目录下所有资源文件（相对路径，正斜杠），跳过 SKILL.md。 */
function listResources(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listResources(path.join(dir, entry.name), rel));
    } else if (entry.name.toLowerCase() !== 'skill.md') {
      out.push(rel);
    }
  }
  return out;
}

function loadSkill(dir: string): SkillInfo | null {
  const file = path.join(dir, 'SKILL.md');
  if (!existsSync(file)) return null;
  try {
    const { body, data } = parseSkill(readFileSync(file, 'utf8'));
    const id = path.basename(dir);
    return {
      content: body,
      description: data.description ?? '',
      file,
      id,
      name: data.name ?? id,
      resources: listResources(dir),
    };
  } catch {
    return null;
  }
}

/** 扫出所有技能（按名字排序）。目录不存在 / 空 → 空数组。 */
export function listSkills(): SkillInfo[] {
  if (!existsSync(SKILLS_DIR)) return [];
  try {
    return readdirSync(SKILLS_DIR)
      .map((name) => path.join(SKILLS_DIR, name))
      .filter((dir) => {
        try {
          return statSync(dir).isDirectory();
        } catch {
          return false;
        }
      })
      .map(loadSkill)
      .filter((skill): skill is SkillInfo => skill !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

/** 按 id（目录名）取一个技能。 */
export function findSkill(id: string): SkillInfo | null {
  const target = id.trim();
  if (!target || target.includes('/') || target.includes('\\') || target.includes('..')) return null;
  const dir = path.join(SKILLS_DIR, target);
  return existsSync(dir) ? loadSkill(dir) : null;
}

/**
 * 读技能里的资源文件（`references/xxx.md`）。做路径穿越校验：解析后必须仍在技能目录内。
 */
export function readSkillResource(id: string, relative: string): string | null {
  const skill = findSkill(id);
  if (!skill) return null;
  const base = path.join(SKILLS_DIR, skill.id);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  try {
    if (!statSync(target).isFile()) return null;
    return readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}
