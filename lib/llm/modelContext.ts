/**
 * 模型「上下文长度」（context window）的识别——压缩阈值按它的 80% 算（见 contextBudget）。
 *
 * 为什么要识别：不同模型的窗口差很多（16k / 128k / 262k），写死一个阈值要么太保守
 * （明明能用 200k 却 16k 就压），要么太激进（窗口装不下，provider 直接报
 * context_length_exceeded）。按模型识别，才能"刚好用满又不过界"。
 *
 * 来源（优先级从高到低）：
 * 1. env `LLM_CONTEXT_WINDOW`：手动兜底（识别不到时用）
 * 2. 外部 CLI（pi）：读隔离环境 models.json 里默认模型的 `contextWindow`
 * 3. 内置模型：GET `{baseURL}/models`，取 `max_model_len`（vLLM）/ `context_length` /
 *    `context_window` / `n_ctx`
 * 4. 都没有 → `DEFAULT_CONTEXT_WINDOW`
 *
 * 结果按 provider+model 缓存；任何失败都静默降级——识别不到不能影响聊天。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { readLlmConfig } from './config';
import { PI_AGENT_DIR, PI_ISOLATED } from './piEnv';

/** 识别不到时的兜底窗口（保守，别把 provider 撑爆） */
export const DEFAULT_CONTEXT_WINDOW = 32_768;

const cache = new Map<string, number>();

function envOverride(): number | null {
  const raw = Number(process.env.LLM_CONTEXT_WINDOW);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** pi 隔离环境里「默认模型」的 contextWindow。 */
function piContextWindow(): number | null {
  if (!PI_ISOLATED) return null;
  const settings = readJson(path.join(PI_AGENT_DIR, 'settings.json'));
  const models = readJson(path.join(PI_AGENT_DIR, 'models.json'));
  if (!models) return null;

  const providers = (models.providers ?? {}) as Record<
    string,
    { models?: Array<{ contextWindow?: number; id?: string }> }
  >;
  const providerName =
    typeof settings?.defaultProvider === 'string' ? settings.defaultProvider : undefined;
  const provider = (providerName ? providers[providerName] : undefined) ?? Object.values(providers)[0];
  if (!provider?.models?.length) return null;

  const modelId = typeof settings?.defaultModel === 'string' ? settings.defaultModel : provider.models[0]?.id;
  const model = provider.models.find((item) => item.id === modelId) ?? provider.models[0];
  return typeof model?.contextWindow === 'number' && model.contextWindow > 0 ? model.contextWindow : null;
}

/** 内置端点：GET /models 找该模型的最大长度字段（vLLM 是 max_model_len）。 */
async function fetchContextWindow(modelId: string): Promise<number | null> {
  const result = readLlmConfig();
  if (!result.ok) return null;
  const { apiKey, baseURL, model } = result.config;
  const id = modelId.trim() || model;
  const cacheKey = `${baseURL}::${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const item = (data.data ?? []).find((entry) => entry.id === id) ?? data.data?.[0];
    const value = Number(
      item?.max_model_len ?? item?.context_length ?? item?.context_window ?? item?.n_ctx,
    );
    if (Number.isFinite(value) && value > 0) {
      cache.set(cacheKey, value);
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** 解析某次运行要用的上下文窗口（tokens）。 */
export async function getContextWindow(opts: {
  /** 'cli' = 外部 CLI（pi 等）；'api' = 内置模型 */
  runtime: 'api' | 'cli';
  /** 内置模型可覆盖（Agent 上填的 model）；空则用 .env.local 的默认模型 */
  modelId?: string | null;
}): Promise<number> {
  const override = envOverride();
  if (override) return override;
  if (opts.runtime === 'cli') {
    return piContextWindow() ?? DEFAULT_CONTEXT_WINDOW;
  }
  return (await fetchContextWindow(opts.modelId ?? '')) ?? DEFAULT_CONTEXT_WINDOW;
}
