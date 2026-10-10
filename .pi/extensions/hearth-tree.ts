/**
 * Hearth 会话树扩展。
 *
 * pi 的 RPC 协议没有"会话内跳转 leaf"的命令（`navigateTree` 只在 SDK / 扩展里），
 * 但 RPC 模式把 `navigateTree` 接进了扩展命令的 context。这里注册一个命令，
 * 让 Hearth 通过 `prompt` 发 `/hearth-navigate <entryId>` 就能在**同一个会话文件内**
 * 从某条 user message 处开兄弟分支（对应 pi TUI 的 `/tree`）。
 *
 * 关键点：不带 summary 的 navigateTree 只改**内存里的 leaf**，新进程会丢。
 * 传 `label` 会让 pi append 一个 label entry（成为新 leaf），从而**落盘**——
 * 这样 Hearth"每轮新起 pi 进程"的架构也能续上分支位置。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** 落盘用的 label 标记（便于识别是 Hearth 触发的导航） */
const BRANCH_LABEL = "hearth-branch";

export default function hearthTree(pi: ExtensionAPI) {
  pi.registerCommand("hearth-navigate", {
    description: "跳转到会话树里的某条 entry（Hearth 用；会落盘以便跨进程续上）",
    handler: async (args, ctx) => {
      const entryId = (args ?? "").trim().split(/\s+/)[0];
      if (!entryId) {
        ctx.ui.notify("用法：/hearth-navigate <entryId>", "warning");
        return;
      }
      // 不生成摘要（省一次模型调用），但带 label → append label entry → leaf 落盘
      await ctx.navigateTree(entryId, { label: BRANCH_LABEL });
    },
  });
}
