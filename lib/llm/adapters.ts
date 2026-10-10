/**
 * 外部 CLI 的**协议适配器**：把各协议的输出归一到 `AgentEvent`。
 *
 * 学 LobeHub「每 agent 一个薄 adapter，上层对协议无感」：这里只放两种我们实际用到的协议——
 * - `pi`：结构化 JSONL（json 模式与 rpc 模式共用，见 `parsePiEvent`）；
 * - `text`：通用纯文本（opencode / claude 等）。
 *
 * 加新协议 = 加一个 adapter 并登记进 `AGENT_ADAPTERS`，运行器不用改。
 */
import { parsePiEvent, stripAnsi, type AgentEvent } from './agentEvents';

export interface AgentAdapter {
  id: string;
  /**
   * 是否按行解析（JSONL 协议）。`false` = 每段 stdout 直接当正文——
   * 纯文本 CLI 可能不按行吐，按行缓冲会破坏"打字机"。
   */
  lineBased: boolean;
  /** 认领这一行/这段（自动探测用；第一个认领的赢）。 */
  match(sample: string): boolean;
  /** 解析一段（`lineBased` 时传单行，否则传整段）。 */
  parse(sample: string): AgentEvent[];
}

/** pi 的结构化 JSONL 协议（json 模式与 rpc 模式共用）。 */
export const piAdapter: AgentAdapter = {
  id: 'pi',
  lineBased: true,
  match: (line) => parsePiEvent(line) !== null,
  parse: (line) => parsePiEvent(line) ?? [],
};

/** 通用纯文本：整段原样当正文（清掉 ANSI 颜色码）。 */
export const textAdapter: AgentAdapter = {
  id: 'text',
  lineBased: false,
  match: () => true, // 兜底
  parse: (chunk) => [{ delta: stripAnsi(chunk), kind: 'text' }],
};

/** 探测顺序：先具体协议，最后兜底文本。 */
export const AGENT_ADAPTERS: AgentAdapter[] = [piAdapter, textAdapter];

/** 按第一行/第一段探测协议；都不认领则用文本兜底。 */
export function detectAdapter(sample: string): AgentAdapter {
  return AGENT_ADAPTERS.find((adapter) => adapter.match(sample)) ?? textAdapter;
}
