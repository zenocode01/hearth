/**
 * Chinese Locale - 让所有模型的思维链与回答始终使用中文
 * 代码、命令、技术术语、引用原文等必要场景除外
 *
 * 双通道策略：
 * 1. before_agent_start：每轮把完整语言要求追加到系统提示词末尾（同一轮内去重）
 * 2. context：每次 LLM 调用前，把简短提醒追加到最后一条用户消息末尾
 *    —— 紧贴生成位置，对本地/小参数模型的思维链语言控制最有效
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MODEL_PATTERN = /./i; // 匹配所有模型

const INSTRUCTION = `
【语言要求】你必须始终使用简体中文进行思考和回答：
1. 思维链（thinking/reasoning）内容必须使用简体中文。
2. 回复正文必须使用简体中文。
3. 例外（这些内容保留原文语言，不做翻译）：代码、Shell/命令、文件路径、API 名称、配置项、技术术语专有名词、引用自文档或原文的语句。
4. 注释如果位于你新写的代码中，也应使用简体中文（除非代码风格约定要求英文）。`;

// 追加到用户消息末尾的短提醒（每次 LLM 调用都会带上，位置最新鲜）
const REMINDER =
  "\n\n【语言提醒】请先用简体中文思考（思维链/thinking 全部用简体中文），再用简体中文回答。" +
  "代码、命令、文件路径、专有名词、引用原文保留原文。";

export default function chineseLocale(pi: ExtensionAPI) {
  // 通道 1：系统提示词
  pi.on("before_agent_start", async (event, ctx) => {
    const model = ctx.model;
    if (!model) return; // 无模型信息时不拦截
    if (!MODEL_PATTERN.test(model.id)) return;
    if (event.systemPrompt.includes("【语言要求】")) return;
    return { systemPrompt: event.systemPrompt + INSTRUCTION };
  });

  // 通道 2：每次 LLM 调用前，在最后一条 user 消息末尾追加短提醒
  pi.on("context", async (event) => {
    const messages = event.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.role !== "user") continue;
      const content = (m as { content?: unknown }).content;
      if (typeof content === "string") {
        (m as { content: string }).content = content + REMINDER;
      } else if (Array.isArray(content)) {
        (m as { content: Array<{ type?: string; text?: string }> }).content.push({
          type: "text",
          text: REMINDER,
        });
      }
      return { messages };
    }
    return undefined;
  });
}
