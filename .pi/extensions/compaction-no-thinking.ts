/**
 * Compaction Without Thinking（压缩时关闭思考模式）
 *
 * 背景
 * ----
 * Pi 生成上下文压缩摘要时，会沿用「当前会话的 thinking level」
 * （见 dist/core/agent-session.js 的 _runDefaultCompaction 调用 compact(..., this.thinkingLevel, ...)）。
 * 对 reasoning 模型来说，这意味着压缩本身就是一次高强度思考，
 * 明显拖慢压缩速度，而摘要任务并不需要高强度推理。
 *
 * 本扩展做什么
 * -----------
 * 在压缩开始前，把当前会话的 thinking level 临时切到 "off"，
 * 压缩结束（成功或失败/取消）后恢复为原来的 level。
 * 这样压缩依然走 Pi 的默认实现（文件追踪、摘要格式、重试策略都不变），
 * 只是不再开启思考模式。
 *
 * 放置位置
 * -------
 *   ~/.pi/agent/extensions/compaction-no-thinking.ts   （全局）
 *   .pi/extensions/compaction-no-thinking.ts            （项目级）
 *
 * 生效方式：执行 /reload 或重启 pi。
 * 不需要时直接删除本文件即可恢复原始行为。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// 压缩前保存的 level；undefined 表示当前没有进行中的压缩
	let savedLevel: Parameters<typeof pi.setThinkingLevel>[0] | undefined;

	const restore = () => {
		if (savedLevel === undefined) return;
		const level = savedLevel;
		savedLevel = undefined;
		try {
			pi.setThinkingLevel(level);
		} catch {
			// 扩展已卸载/上下文失效时忽略恢复失败
		}
	};

	pi.on("session_before_compact", async (_event, ctx) => {
		// 非 reasoning 模型本来就不会思考，交给默认逻辑即可
		if (!ctx.model?.reasoning) return;

		const current = pi.getThinkingLevel();
		// 已经是 off，或已有一次未恢复的压缩在进行，不重复处理
		if (current === "off" || savedLevel !== undefined) return;

		savedLevel = current;
		pi.setThinkingLevel("off");
	});

	// 压缩成功、失败或被取消时都要恢复，避免 thinking level 卡在 off
	pi.on("session_compact", async () => restore());
	pi.on("session_compact_failed", async () => restore());
}
