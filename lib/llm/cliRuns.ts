import type { QuestionAnswer } from './piRpc';

/**
 * 正在运行的 CLI Agent 的注册表：浏览器要能把「问题的答案」送回到正在等待的进程。
 *
 * 数据流（参考 refs 的 AskUserBridge）：
 *   pi（RPC 模式）发出 extension_ui_request → 运行器调用 askUser → 路由把问题写进聊天流
 *   → 用户点选项/输入 → POST /api/cli-runs/[id]/answer → resolveQuestion → 运行器写回 pi → 继续
 *
 * 单进程 dev server 用模块级 Map 即可；连接是热重载安全的（挂 globalThis）。
 * 2026-10-08 结构升级（V2 key，旧格式条目直接作废）：run 带 meta（topicId，
 * 跨会话提示用），pending 带展示信息（input/method，注册表列表用）。
 */
export interface RunMeta {
  /** 这一轮跑在哪个会话里（跨会话提示定位用） */
  topicId?: string | null;
}

/** 注册等待回答时附带的展示信息（提问栏/跨会话列表要显示问题内容） */
export interface PendingQuestionMeta {
  input?: unknown;
  method?: string;
}

interface PendingEntry {
  input?: unknown;
  method?: string;
  resolve: (answer: QuestionAnswer) => void;
}

interface RunEntry {
  meta: RunMeta;
  questions: Map<string, PendingEntry>;
}

/** 一个「等待回答的提问」的公开视图（GET /api/cli-runs 的返回项） */
export interface PendingQuestionInfo {
  input?: unknown;
  method?: string;
  requestId: string;
  runId: string;
  topicId: string | null;
}

const globalForRuns = globalThis as unknown as {
  __hearthCliRunsV2?: Map<string, RunEntry>;
};

const runs = (globalForRuns.__hearthCliRunsV2 ??= new Map<string, RunEntry>());

export function createRun(runId: string, meta: RunMeta = {}): void {
  runs.set(runId, { meta, questions: new Map() });
}

/** 运行结束：把没回答的问题都取消掉，避免 UI 一直等 */
export function endRun(runId: string): void {
  const run = runs.get(runId);
  run?.questions.forEach((question) => question.resolve({ cancelled: true }));
  runs.delete(runId);
}

/** 注册一个等待回答的问题，返回一个 Promise（等浏览器提交） */
export function waitForQuestion(
  runId: string,
  requestId: string,
  meta: PendingQuestionMeta = {},
): Promise<QuestionAnswer> {
  const run = runs.get(runId);
  if (!run) return Promise.resolve({ cancelled: true });

  return new Promise<QuestionAnswer>((resolve) => {
    run.questions.set(requestId, { input: meta.input, method: meta.method, resolve });
  });
}

/** 浏览器提交答案 */
export function resolveQuestion(runId: string, requestId: string, answer: QuestionAnswer): boolean {
  const run = runs.get(runId);
  const question = run?.questions.get(requestId);
  if (!run || !question) return false;

  run.questions.delete(requestId);
  question.resolve(answer);
  return true;
}

/** 当前所有会话里等待回答的提问（跨会话提示的数据源，浏览器每 3s 轮询 GET /api/cli-runs）。 */
export function listPendingQuestions(): PendingQuestionInfo[] {
  const out: PendingQuestionInfo[] = [];
  for (const [runId, run] of runs) {
    for (const [requestId, entry] of run.questions) {
      out.push({
        input: entry.input,
        method: entry.method,
        requestId,
        runId,
        topicId: run.meta.topicId ?? null,
      });
    }
  }
  return out;
}
