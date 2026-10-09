/**
 * 当前模型的能力判定（"家用配方"版）。
 *
 * LobeChat 有 `model-bank` 的 `ModelAbilities`（vision/audio/video…）逐模型标注；我们只接
 * 一个 OpenAI 兼容端点 + 自己的 env，所以用**环境变量开关**，别为它引入模型注册表。
 *
 * - `LLM_VISION`：内置模型是否支持视觉。默认 `1`（假设支持）；设成 `0` 时图片附件会被
 *   换成显式占位符（而不是静默丢掉），让模型能主动告诉用户"我看不到这张图"。
 *   本机实测 6002 的 qwen3.8-27b 支持视觉（`usage.prompt_tokens_details.multimodal_tokens` 有值）。
 * - pi（CLI）路径不看这里：pi 自己决定用哪个模型与能力。
 */
export function builtinSupportsVision(): boolean {
  const raw = process.env.LLM_VISION?.trim().toLowerCase();
  if (!raw) return true;
  return raw !== '0' && raw !== 'false' && raw !== 'no';
}
