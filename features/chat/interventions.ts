import type { UIMessage } from 'ai';

/** 等待用户回答的提问（来自 pi RPC 模式；路由把 awaiting 标记写进工具片段） */
export interface PendingQuestion {
  input?: unknown;
  requestId: string;
  runId: string;
  toolCallId: string;
}

/**
 * 找**仍在等待回答**的提问（从最后一条消息往前扫）。
 * 参考 refs 的 InterventionBar：pending 项汇总到输入框上方，而不是散在消息里。
 */
export function findPendingQuestion(messages: UIMessage[]): PendingQuestion | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const { parts } = messages[index];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex] as {
        state?: string;
        toolCallId?: string;
        toolMetadata?: { awaiting?: boolean; requestId?: string; runId?: string };
      };
      const metadata = part.toolMetadata;
      if (
        part.state === 'input-available' &&
        metadata?.awaiting &&
        metadata.requestId &&
        metadata.runId &&
        part.toolCallId
      ) {
        return {
          input: (part as { input?: unknown }).input,
          requestId: metadata.requestId,
          runId: metadata.runId,
          toolCallId: part.toolCallId,
        };
      }
    }
  }
  return null;
}
