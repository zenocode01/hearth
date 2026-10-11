/**
 * 时间戳的"去类型"工具：把 schema 的 `Date` 变成真正能算的毫秒数。
 *
 * ## 坑（本项目最容易踩的一个）
 *
 * Drizzle 的 `integer(..., { mode: 'timestamp_ms' })` 在**服务端**读出来是 `Date`，
 * 但只要经过 `Response.json()` 到浏览器，它就变成 **ISO 字符串**（`"2026-10-11T…"`），
 * 而 `Topic['updatedAt']` 这类**类型仍然写着 `Date`**——schema 类型描述的是"数据库视图"，
 * 不是"JSON 视图"。
 *
 * 于是浏览器里直接 `topic.updatedAt.getTime()` 就炸：
 *
 * ```
 * TypeError: b.updatedAt.getTime is not a function
 * ```
 *
 * 历史教训：侧栏加"按最近活动排序"时写的 `b.updatedAt.getTime()` 就是这么炸的
 * ——之前没有代码在客户端碰过时间戳，所以这个不一致一直没暴露。
 *
 * ## 用法
 *
 * **凡是客户端**（组件、hook、纯逻辑）要拿会话/消息/Agent 的时间戳去排序或显示，
 * 一律先过 `toTime()`，别直接 `.getTime()`。服务端（同进程内拿 DB 结果）可以直接用 Date。
 */
export function toTime(value: Date | number | string | null | undefined): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  // 数字当毫秒时间戳，字符串按 ISO/日期串解析
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}