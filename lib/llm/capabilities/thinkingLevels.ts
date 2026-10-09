/**
 * pi（CLI）侧模型的思考能力——用来给 UI 做能力门。
 *
 * ## 为什么需要
 *
 * pi 的模型配置里有 `thinkingLevelMap`，声明每个档位到底映射成什么：
 *
 * ```json
 * {"low":"low","medium":"medium","high":"xhigh","xhigh":"xhigh",
 *  "minimal":null,"off":null,"max":null}
 * ```
 *
 * `null` 表示**这个模型不支持该档**。本机 6001 的 flash 模型就关不掉思考（`off:null`）。
 * pi 收到不支持的档位不会报错，只是静默不生效——所以 UI 必须提前筛掉，
 * 否则用户选了"关闭思考"发现一点没变，只会觉得是 bug。
 *
 * LobeChat 用 model-bank 的 `settings.extendParams` 做同一件事（见
 * `packages/model-bank/src/types/aiModel.ts` 的 ExtendParamsType），
 * 我们只有自己的 models.json，直接读就够了，不建能力矩阵。
 *
 * ## 数据从哪来
 *
 * 隔离环境的 `.pi-runtime/agent/models.json` 与 `settings.json`
 * （见 lib/llm/piEnv.ts：为什么必须读**隔离**那份——全局那份是用户自己的，
 * 模型可能完全不同）。读不到就返回 null，调用方按"不知道"处理（全给档位）。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PI_AGENT_DIR, PI_ISOLATED } from '../piEnv';
import { REASONING_EFFORTS, type ReasoningEffort } from '../reasoning';

export interface PiModelCapabilities {
  /** 模型 id（读到了才有） */
  modelId: string | null;
  provider: string | null;
  /** 模型是否声明支持推理 */
  reasoning: boolean;
  /** 真正能生效的档位（thinkingLevelMap 里映射非 null 的） */
  supportedLevels: ReasoningEffort[];
  /** 模型把某个档位映射成了什么（如 high → xhigh），用于 UI 提示 */
  levelAliases: Partial<Record<ReasoningEffort, string>>;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 读当前 pi 环境的默认模型能力；读不到任何东西时返回 null（= 不知道，不做限制） */
export function readPiModelCapabilities(): PiModelCapabilities | null {
  if (!PI_ISOLATED) return null;

  const settings = readJson(path.join(PI_AGENT_DIR, 'settings.json'));
  const models = readJson(path.join(PI_AGENT_DIR, 'models.json'));
  if (!models) return null;

  const providers = (models.providers ?? {}) as Record<
    string,
    { baseUrl?: string; models?: Array<{ id?: string; reasoning?: boolean; thinkingLevelMap?: Record<string, string | null> }> }
  >;

  const providerName =
    typeof settings?.defaultProvider === 'string' ? settings.defaultProvider : undefined;
  const provider =
    (providerName ? providers[providerName] : undefined) ?? Object.values(providers)[0];
  if (!provider?.models?.length) return null;

  const modelId =
    typeof settings?.defaultModel === 'string' ? settings.defaultModel : provider.models[0]?.id;
  const model =
    provider.models.find((item) => item.id === modelId) ?? provider.models[0];
  if (!model) return null;

  const map = model.thinkingLevelMap;
  if (!map) {
    // 没有 thinkingLevelMap：模型没声明推理能力（或是不需要声明的纯文本模型）
    return {
      levelAliases: {},
      modelId: model.id ?? null,
      provider: providerName ?? null,
      reasoning: model.reasoning === true,
      supportedLevels: [],
    };
  }

  const supportedLevels: ReasoningEffort[] = [];
  const levelAliases: Partial<Record<ReasoningEffort, string>> = {};
  for (const item of REASONING_EFFORTS) {
    const mapped = map[item.value];
    if (mapped) {
      supportedLevels.push(item.value);
      // high → xhigh 这种改名要让用户看见，否则"高"和"极高"看起来一样
      if (mapped !== item.value) levelAliases[item.value] = mapped;
    }
  }

  return {
    levelAliases,
    modelId: model.id ?? null,
    provider: providerName ?? null,
    reasoning: model.reasoning === true,
    supportedLevels,
  };
}

/**
 * 内置模型（api 分支）的能力：靠环境变量，和 `LLM_VISION` 一个路子
 * （见 lib/llm/capabilities.ts——不为它建模型注册表）。
 *
 * `LLM_REASONING_LEVELS=low,medium,high` 指定支持的档位；不设 = 不限制（全给）。
 * 留空字符串或 `all` 也是"不限制"。
 */
export function readBuiltinModelCapabilities(): PiModelCapabilities | null {
  const raw = process.env.LLM_REASONING_LEVELS?.trim();
  if (!raw || raw.toLowerCase() === 'all') return null;

  const allowed = new Set(
    raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowed.size === 0) return null;

  const supportedLevels = REASONING_EFFORTS.filter((item) => allowed.has(item.value)).map(
    (item) => item.value,
  );
  if (supportedLevels.length === 0) return null;

  return {
    levelAliases: {},
    modelId: null,
    provider: null,
    reasoning: true,
    supportedLevels,
  };
}