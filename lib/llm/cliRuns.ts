import type { QuestionAnswer } from './piRpc';

/**
 * 正在运行的 CLI Agent 的注册表：浏览器要能把「问题的答案」送回到正在等待的进程。
 *
 * 数据流（参考 refs 的 AskUserBridge）：
 *   pi（RPC 模式）发出 extension_ui_request → 运行器调用 askUser → 路由把问题写进聊天流
 *   → 用户点选项/输入 → POST /api/cli-runs/[id]/answer → resolveQuestion → 运行器写回 pi → 继续
 *
 * 单进程 dev server 用模块级 Map 即可；连接是热重载安全的（挂 globalThis）。
 */
interface PendingQuestion {
  resolve: (answer: QuestionAnswer) => void;
}

const globalForRuns = globalThis as unknown as {
  __hearthCliRuns?: Map<string, Map<string, PendingQuestion>>;
};

const runs = (globalForRuns.__hearthCliRuns ??= new Map<string, Map<string, PendingQuestion>>());

export function createRun(runId: string): void {
  runs.set(runId, new Map());
}

/** 运行结束：把没回答的问题都取消掉，避免 UI 一直等 */
export function endRun(runId: string): void {
  const pending = runs.get(runId);
  pending?.forEach((question) => question.resolve({ cancelled: true }));
  runs.delete(runId);
}

/** 注册一个等待回答的问题，返回一个 Promise（等浏览器提交） */
export function waitForQuestion(runId: string, requestId: string): Promise<QuestionAnswer> {
  const pending = runs.get(runId);
  if (!pending) return Promise.resolve({ cancelled: true });

  return new Promise<QuestionAnswer>((resolve) => {
    pending.set(requestId, { resolve });
  });
}

/** 浏览器提交答案 */
export function resolveQuestion(runId: string, requestId: string, answer: QuestionAnswer): boolean {
  const pending = runs.get(runId);
  const question = pending?.get(requestId);
  if (!pending || !question) return false;

  pending.delete(requestId);
  question.resolve(answer);
  return true;
}
