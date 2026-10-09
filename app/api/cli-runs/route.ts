import { listPendingQuestions } from '@/lib/llm/cliRuns';

/**
 * GET /api/cli-runs —— 当前所有会话里「等待回答的提问」（跨会话提示的数据源）。
 *
 * 浏览器每 3s 轮询一次（features/chat/usePendingRuns.ts）：
 * 侧边栏给对应会话打「待回答」徽章，输入框上方出现跨会话提示条（PendingIsland）。
 * 数据来自服务端注册表（不是消息里的 awaiting 标记）——标记只在流内存里，
 * 切走再切回/刷新后消息会丢，注册表才是事实。
 */
export function GET() {
  return Response.json({ pending: listPendingQuestions() });
}
