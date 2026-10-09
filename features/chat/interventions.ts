import type { UIMessage } from 'ai';

/** 等待用户回答的提问（来自 pi RPC 模式；路由把 awaiting 标记写进工具片段） */
export interface PendingQuestion {
  input?: unknown;
  method?: string;
  requestId: string;
  runId: string;
  /** 消息里的工具片段定位用；从服务端注册表恢复时没有 */
  toolCallId?: string;
}

/**
 * 找**所有仍在等待回答**的提问（消息从后往前、每条消息的片段从后往前扫）。
 * 参考 refs 的 InterventionBar：pending 项汇总到输入框上方，而不是散在消息里。
 * 正常情况下 pi 是串行提问（同会话最多 1 个）；返回数组是为了渲染多 pending 时的 tab。
 */
export function findPendingQuestions(messages: UIMessage[]): PendingQuestion[] {
  const found: PendingQuestion[] = [];
  for (const message of messages) {
    for (const part of message.parts as Array<{
      state?: string;
      toolCallId?: string;
      input?: unknown;
      toolMetadata?: { awaiting?: boolean; requestId?: string; runId?: string };
    }>) {
      const metadata = part.toolMetadata;
      if (
        part.state === 'input-available' &&
        metadata?.awaiting &&
        metadata.requestId &&
        metadata.runId &&
        part.toolCallId
      ) {
        found.push({
          input: part.input,
          requestId: metadata.requestId,
          runId: metadata.runId,
          toolCallId: part.toolCallId,
        });
      }
    }
  }
  return found;
}

/** 问题首行文本（tab 标签 / 跨会话列表预览用） */
export function questionText(input: unknown): string {
  const question = (input as { question?: unknown } | null)?.question;
  return typeof question === 'string' && question.trim() ? question.trim() : '需要你的选择';
}

/**
 * 合并两路 pending：消息里的 awaiting 标记（实时、带 toolCallId）+ 服务端注册表
 * （跨会话轮询；切走再切回或刷新后，消息标记会丢，注册表是唯一事实）。
 * 按 requestId 去重，消息路优先（内容一致，优先走带 toolCallId 的那份）。
 */
export function mergePendingQuestions(
  fromMessages: PendingQuestion[],
  fromRegistry: PendingQuestion[],
): PendingQuestion[] {
  const seen = new Set(fromMessages.map((item) => item.requestId));
  return [...fromMessages, ...fromRegistry.filter((item) => !seen.has(item.requestId))];
}
