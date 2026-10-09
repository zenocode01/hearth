/**
 * 思考等级（reasoning effort）——两条链路共用的档位定义。
 *
 * LobeChat 的做法（`packages/types/src/agent/chat.ts` + `Params/Controls.tsx`）是把它放进
 * `chatConfig`（Agent 级配置），UI 在输入框工具栏的 Params 面板里切换，另外还有"显示思考
 * 过程"这个独立开关。我们只取前者：等级跟着 Agent 走，不引入 model-bank 的能力矩阵
 * （家用配方只有 1~2 个 openai-compatible 端点，见 lib/llm/capabilities.ts 的取舍）。
 *
 * ## 为什么要它
 *
 * 把"想清楚"和"想多久"交给用户控制。代价是实打实的钱和时间——所以也该给用户一把开关。
 *
 * ## ⚠️ 档位是否生效，取决于模型
 *
 * pi 的 `get_state` 会返回模型的 `thinkingLevelMap`（能力声明）。本机 6001 的
 * qwen3.8-flash-next-iq3_s 是这样：
 *
 * ```json
 * {"low":"low","medium":"medium","high":"xhigh","xhigh":"xhigh",
 *  "minimal":null,"off":null,"max":null}
 * ```
 *
 * 也就是说它**关不掉思考**（`off → null`），而且 `high` 会被当成 `xhigh`。
 * 给一个不支持的档位，pi 不会报错，只是静默不生效——所以 UI 必须做能力门
 * （见下方 TODO），否则用户会以为"关闭思考"能提速，结果毫无变化。
 *
 * 别把某个档位的耗时当结论：同一问题重复测量，`off`（无效档）跑到 31 秒、
 * `xhigh` 跑到 15 秒，差异全是远端推理服务的抖动。远端单机 27B 的长尾就有 5~90 秒。
 *
 * ## 两条链路怎么落地
 *
 * - 内置模型 API：`streamText({ providerOptions: { 'hearth-llm': { reasoningEffort } } })`
 *   （`@ai-sdk/openai-compatible` 的 chat options 里确实有 `reasoningEffort`；
 *   本机 vllm 0.30 接受 `reasoning_effort` 字段，实测 HTTP 200）
 * - 外部 CLI（pi）：spawn 之后、发 prompt 之前，先发一条
 *   `{"type":"set_thinking_level","level":…}` RPC 命令。
 *   pi 侧的可用档位可以先 `{"type":"get_available_thinking_levels"}` 查，
 *   再用 `get_state` 的 `thinkingLevelMap` 确认某档是否真的映射得到。
 *
 * 不支持的档位会被服务端**静默丢弃**（normalize 过滤），不会把脏值发给模型。
 */

/** 全部可选档位；顺序即 UI 展示顺序 */
export const REASONING_EFFORTS = [
  { label: '关闭', value: 'off' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '极高', value: 'xhigh' },
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]['value'];

const ALLOWED = new Set<string>(REASONING_EFFORTS.map((item) => item.value));

/** 空值 = 不干预，交给运行方默认值（api 用模型默认；pi 用它 settings.json 里的默认） */
export const DEFAULT_REASONING_EFFORT: ReasoningEffort | null = null;

/** 把任意输入收敛成合法档位；非法/空 → null（= 不干预） */
export function normalizeReasoningEffort(value: unknown): ReasoningEffort | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  // 兼容 LobeChat 的空档写法：none / disabled / 0 都当"关闭"
  if (trimmed === 'none' || trimmed === 'disabled' || trimmed === '0') return 'off';
  return ALLOWED.has(trimmed) ? (trimmed as ReasoningEffort) : null;
}

/** UI 用：显示中文标签 */
export function reasoningEffortLabel(value: unknown): string {
  const normalized = normalizeReasoningEffort(value);
  if (!normalized) return '默认';
  return REASONING_EFFORTS.find((item) => item.value === normalized)?.label ?? '默认';
}