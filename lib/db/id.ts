import { randomUUID } from 'node:crypto';

/** 生成带前缀的实体 id（前缀便于在日志/URL 里辨认类型，参考 refs 的 idGenerator 思路）。 */
export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}
