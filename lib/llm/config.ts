/** 模型接入配置：任何 OpenAI 兼容接口（OpenAI / 通义 / DeepSeek / Kimi…）。 */

export interface LlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export type LlmConfigResult =
  | { ok: true; config: LlmConfig }
  | { ok: false; missing: string[] };

export function readLlmConfig(): LlmConfigResult {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push('LLM_API_KEY');
  if (!baseURL) missing.push('LLM_BASE_URL');
  if (!model) missing.push('LLM_MODEL');
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, config: { apiKey: apiKey!, baseURL: baseURL!, model: model! } };
}
