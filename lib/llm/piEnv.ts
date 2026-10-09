import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * pi 的**项目内隔离环境**。
 *
 * ## 为什么必须隔离
 *
 * 我们每个请求都 spawn 一个新的 pi 进程（`--mode rpc`）。而 pi 默认读的是**全局**
 * `~/.pi/agent/`，那里有用户自己的一整套扩展：`pi-memory`（每次注入几十条记忆）、
 * `pi-session-search`（每次重扫几百 MB 历史会话重建 FTS 索引）、`pi-knowledge-search`
 * （索引本地文件）、以及 git-status / todo / llm-metrics 等与本项目无关的扩展。
 *
 * 实测（2026-10-09）：同一句 "2+2=?"，用全局环境 **50~72 秒**，隔离后 **2.6 秒**。
 * 慢的不是模型（网络 RTT 41ms、模型热了 0.8s 答完），是每次都重跑那套全局基建。
 *
 * ## 怎么隔离
 *
 * pi 的 agent 目录走环境变量 `PI_CODING_AGENT_DIR`（见它的 `getAgentDir()`：
 * `process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')`），
 * 会话目录走 `PI_CODING_AGENT_SESSION_DIR`。注入这两个变量即可整体搬家。
 * 注意 `HOME` **不管用**（实测：改了 HOME 扩展照旧加载）。
 *
 * 隔离后的目录布局（`.pi-runtime/` 已 gitignore——里面有 API key）：
 * ```
 * .pi-runtime/agent/settings.json   默认模型/provider（我们自己的）
 * .pi-runtime/agent/models.json     provider + apiKey（从全局复制）
 * .pi-runtime/agent/auth.json       其他 provider 的凭据
 * .pi-runtime/sessions/*.jsonl      会话记录
 * ```
 * 用 `npm run pi:setup` 生成（从全局复制 models.json/auth.json）。
 */

/** 项目内 pi 运行时根目录（含 API key，务必保持在 gitignore 里） */
export const PI_RUNTIME_DIR =
  process.env.HEARTH_PI_RUNTIME_DIR ?? path.join(process.cwd(), '.pi-runtime');

/** pi 的 agentDir：settings.json / models.json / auth.json / extensions 都在这里 */
export const PI_AGENT_DIR =
  process.env.HEARTH_PI_AGENT_DIR ?? path.join(PI_RUNTIME_DIR, 'agent');

/** pi 的会话目录：独立出来，免得项目里的对话污染用户全局 ~/.pi 的历史 */
export const PI_SESSION_DIR =
  process.env.HEARTH_PI_SESSION_DIR ?? path.join(PI_RUNTIME_DIR, 'sessions');

/** 隔离总开关：设 `HEARTH_PI_ISOLATE=0` 可临时回到用户全局 pi 环境（排查用） */
export const PI_ISOLATED = process.env.HEARTH_PI_ISOLATE !== '0';

/**
 * 要注入给 pi 进程的环境变量。
 * 隔离关闭时返回空对象——这样和以前完全一样（用用户自己的 ~/.pi）。
 */
export function piEnvExtra(): Record<string, string> {
  if (!PI_ISOLATED) return {};
  return {
    PI_CODING_AGENT_DIR: PI_AGENT_DIR,
    PI_CODING_AGENT_SESSION_DIR: PI_SESSION_DIR,
  };
}

/**
 * 命令是不是 pi？只在确实是 pi 时才注入隔离环境——
 * 这条运行器也服务 opencode / claude 等别的 CLI，不能连累它们。
 * 认 `pi` / `pi.cmd` / `pi.exe` / 绝对路径里的 pi。
 */
export function looksLikePiCommand(file: string): boolean {
  const base = path.basename(file).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
  return base === 'pi';
}

/**
 * 项目扩展的**源码目录**（进 git）：`F:\zeno\hearth\.pi\extensions/*.ts`。
 */
export const PROJECT_EXTENSIONS_DIR = path.join(process.cwd(), '.pi', 'extensions');

let extensionsSynced = false;

/**
 * 把项目扩展源码同步到 agentDir 的 `extensions/` 下。
 *
 * ## 为什么是"复制"而不是直接放项目级 `.pi/extensions/`
 *
 * pi 加载**项目级**配置（extensions / settings.json / skills / mcp …）需要先在
 * `agentDir/trust.json` 里信任该目录，否则静默跳过：
 * `TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES = ['settings.json','mcp.json','extensions',…]`
 * + `ProjectTrustStore.findNearestTrustEntry()`。
 * 而 agentDir 下（用户级）的扩展**不需要任何信任**，直接加载。
 *
 * 所以：源码留在 `.pi/extensions/`（进 git、可 review），运行时复制到
 * `agentDir/extensions/`。每进程只同步一次（dev 热重载会重跑，改了源码刷新即生效）。
 *
 * 顺带解释为什么不能靠项目 cwd：pi 报告的 cwd 是 `F:/zeno`（不是 `F:/zeno/hearth`），
 * 项目级目录会落到仓库外面去，不受版本管理。
 */
export function syncProjectExtensions(): string[] {
  if (!PI_ISOLATED || extensionsSynced) return [];
  extensionsSynced = true;
  if (!existsSync(PROJECT_EXTENSIONS_DIR)) return [];

  const dest = path.join(PI_AGENT_DIR, 'extensions');
  try {
    mkdirSync(dest, { recursive: true });
    cpSync(PROJECT_EXTENSIONS_DIR, dest, { force: true, recursive: true });
    return readdirSync(dest).filter((name) => name.endsWith('.ts'));
  } catch {
    // 同步失败不该拖垮对话——pi 只是少加载几个扩展而已
    return [];
  }
}

export interface PiRuntimeCheck {
  /** 有问题时的中文说明，可以直接给用户看 */
  error?: string;
  missing: string[];
  ok: boolean;
}

/**
 * 启动前检查隔离环境是否就绪。
 *
 * 必须在 spawn **之前**查：否则 pi 会因为找不到 provider 而抛一堆英文错误
 * （AGENTS.md 验收项：失败路径必须有可读提示）。
 */
export function checkPiRuntime(): PiRuntimeCheck {
  if (!PI_ISOLATED) return { missing: [], ok: true };

  // 顺带把项目扩展同步进 agentDir（每进程一次；改了 .pi/extensions/*.ts 后 dev 刷新即生效）
  syncProjectExtensions();

  const missing: string[] = [];
  if (!existsSync(path.join(PI_AGENT_DIR, 'models.json'))) missing.push('models.json');
  if (!existsSync(path.join(PI_AGENT_DIR, 'settings.json'))) missing.push('settings.json');

  if (missing.length === 0) return { missing, ok: true };

  return {
    error:
      `项目内 pi 环境还没准备好（缺 ${missing.join('、')}）。\n` +
      `在项目根目录执行一次：npm run pi:setup\n` +
      `它会从你的全局 pi 配置（~/.pi/agent/）复制 models.json 与 auth.json 到 ${PI_AGENT_DIR}。`,
    missing,
    ok: false,
  };
}