import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import { readLlmConfig } from './config';

/** 配置缺失时抛出，路由据此返回可读的提示。 */
export class MissingLlmConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`缺少模型配置：${missing.join(', ')}`);
    this.name = 'MissingLlmConfigError';
    this.missing = missing;
  }
}

/** 按 .env.local 创建聊天模型（provider 与模型都不写死）；模型名可被 Agent 覆盖。 */
export function createChatModel(modelOverride?: string | null): LanguageModel {
  const result = readLlmConfig();
  if (!result.ok) throw new MissingLlmConfigError(result.missing);

  const provider = createOpenAICompatible({
    baseURL: result.config.baseURL,
    name: 'pi-llm',
    apiKey: result.config.apiKey,
  });

  return provider.chatModel(modelOverride?.trim() || result.config.model);
}
