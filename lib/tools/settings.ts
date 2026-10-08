/**
 * 工具开关的纯逻辑（**不 import `ai`**，客户端与服务端都能用）。
 * 工具本身的定义在 `lib/llm/tools.ts`（那里会拉进 AI SDK，只能服务端用）。
 */

/** 会话里的工具开关条目（参考 LobeHub 的 pluginConfig：不在列表里 = auto 自动启用） */
export interface ToolSetting {
  mode: 'auto' | 'disabled';
  name: string;
}

/** 宽松解析数据库/请求里的工具开关 JSON（坏数据当没设置）。 */
export function parseToolSettings(raw: string | null | undefined): ToolSetting[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item): item is ToolSetting => {
        const entry = item as ToolSetting;
        return (
          typeof entry?.name === 'string' && (entry.mode === 'auto' || entry.mode === 'disabled')
        );
      })
      .map((item) => ({ mode: item.mode, name: item.name }));
  } catch {
    return null;
  }
}

/**
 * 开关条目 → 启用名单（没提到的工具默认启用）。
 * `allNames` 由调用方给：服务端用 chatTools 的 key，客户端用 `/api/tools` 的目录。
 * 返回 null = 全部启用。
 */
export function enabledToolNames(
  settings: ToolSetting[] | null | undefined,
  allNames: string[],
): string[] | null {
  if (!settings) return null;
  const disabled = new Set(
    settings.filter((item) => item.mode === 'disabled').map((item) => item.name),
  );
  return allNames.filter((name) => !disabled.has(name));
}
