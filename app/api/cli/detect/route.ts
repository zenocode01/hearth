import { cliExecutableOf, heteroAgentOfCommand } from '@/lib/llm/heteroAgents';
import { detectCliExecutable } from '@/lib/llm/cliDetect';

/**
 * POST /api/cli/detect —— 检测外部 CLI 是否已安装（Agent 编辑页的「检测」按钮用）。
 *
 * body: { command }。返回可执行名、是否在 PATH、路径，以及已知 agent 的安装提示。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { command?: unknown };
  const command = String(body.command ?? '').trim();
  if (!command) return Response.json({ error: '命令为空' }, { status: 400 });

  const executable = cliExecutableOf(command);
  if (!executable) {
    return Response.json({ error: '从命令里读不出可执行文件' }, { status: 400 });
  }

  const agent = heteroAgentOfCommand(command);
  const path = detectCliExecutable(executable);
  return Response.json({
    agentType: agent?.type ?? null,
    executable,
    found: Boolean(path),
    installHint: agent?.installHint ?? null,
    path,
  });
}
