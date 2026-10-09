#!/usr/bin/env node
/**
 * 准备**项目内隔离的 pi 环境**（`.pi-runtime/`）。
 *
 * 为什么要这一步：pi 默认读全局 `~/.pi/agent/`，那里有你自己的整套扩展
 * （pi-memory 记忆注入、pi-session-search 每次重扫几百 MB 历史会话索引…）。
 * 我们每个请求都 spawn 一个新 pi，等于每轮对话都重跑那套基建，实测慢 20~30 倍
 * （50~72 秒 vs 2.6 秒）。隔离后 pi 只用本项目的配置。
 *
 * 做的事（幂等，已存在的文件不覆盖，除非 --force）：
 *   1. 复制全局 ~/.pi/agent/models.json → .pi-runtime/agent/models.json
 *   2. 复制全局 ~/.pi/agent/auth.json   → .pi-runtime/agent/auth.json
 *   3. 生成 .pi-runtime/agent/settings.json（默认模型沿用全局的选择）
 *   4. 复制全局的 extensions/ 里你可能想要的扩展（默认不复制，见 --with-extensions）
 *
 * 用法：
 *   npm run pi:setup                     # 基础隔离
 *   npm run pi:setup -- --with-extensions # 额外复制全局扩展（会带上它们的开销）
 *   npm run pi:setup -- --force          # 覆盖已有文件
 *
 * 安全：.pi-runtime/ 里含 API key，必须保持在 .gitignore 里（仓库已配）。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const runtimeDir = process.env.HEARTH_PI_RUNTIME_DIR ?? path.join(repoRoot, '.pi-runtime');
const agentDir = process.env.HEARTH_PI_AGENT_DIR ?? path.join(runtimeDir, 'agent');
const sessionDir = process.env.HEARTH_PI_SESSION_DIR ?? path.join(runtimeDir, 'sessions');

const globalAgentDir = path.join(os.homedir(), '.pi', 'agent');

const args = process.argv.slice(2);
const force = args.includes('--force');
const withExtensions = args.includes('--with-extensions');

/** 值得复制到项目环境的全局扩展（其余的与本项目无关：git-status/todo/llm-metrics…） */
const USEFUL_EXTENSIONS = ['chinese-locale.ts', 'question.ts', 'compaction-no-thinking.ts'];

const log = (msg) => console.log(msg);
const warn = (msg) => console.warn(msg);

if (!existsSync(globalAgentDir)) {
  warn(`找不到全局 pi 配置目录：${globalAgentDir}`);
  warn('如果你没装过 pi 或换了位置，请手动在 .pi-runtime/agent/ 下放 models.json 与 settings.json。');
  process.exit(1);
}

mkdirSync(agentDir, { recursive: true });
mkdirSync(sessionDir, { recursive: true });

// 1) provider + key
for (const name of ['models.json', 'auth.json']) {
  const src = path.join(globalAgentDir, name);
  const dest = path.join(agentDir, name);
  if (!existsSync(src)) {
    warn(`跳过 ${name}（全局没有这个文件）`);
    continue;
  }
  if (existsSync(dest) && !force) {
    log(`· ${name} 已存在，跳过（--force 可覆盖）`);
    continue;
  }
  copyFileSync(src, dest);
  log(`✓ ${name} ← 全局配置`);
}

// 2) settings.json：沿用全局的默认模型选择，但**不带 packages/extensions**
//    （packages 里的 pi-total-recall 正是慢的根源，见 lib/llm/piEnv.ts 的说明）
const destSettings = path.join(agentDir, 'settings.json');
if (existsSync(destSettings) && !force) {
  log('· settings.json 已存在，跳过（--force 可覆盖）');
} else {
  let generated = {
    defaultProvider: 'local-llm-6001',
    defaultModel: 'qwen3.8-flash-next-iq3_s',
    defaultThinkingLevel: 'high',
  };

  const globalSettings = path.join(globalAgentDir, 'settings.json');
  if (existsSync(globalSettings)) {
    try {
      const g = JSON.parse(readFileSync(globalSettings, 'utf8'));
      generated = {
        defaultProvider: g.defaultProvider ?? generated.defaultProvider,
        defaultModel: g.defaultModel ?? generated.defaultModel,
        defaultThinkingLevel: g.defaultThinkingLevel ?? generated.defaultThinkingLevel,
      };
    } catch (error) {
      warn(`全局 settings.json 解析失败，用默认值：${error.message}`);
    }
  }

  writeFileSync(destSettings, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');
  log(`✓ settings.json ← 默认 ${generated.defaultProvider}/${generated.defaultModel}`);
  log('  （故意不带 packages/extensions：那正是慢的根源）');
}

// 3) 可选：复制你可能想要的扩展
if (withExtensions) {
  const srcExt = path.join(globalAgentDir, 'extensions');
  const destExt = path.join(agentDir, 'extensions');
  for (const name of USEFUL_EXTENSIONS) {
    const src = path.join(srcExt, name);
    if (!existsSync(src)) {
      warn(`跳过 ${name}（全局没有）`);
      continue;
    }
    mkdirSync(destExt, { recursive: true });
    if (existsSync(path.join(destExt, name)) && !force) {
      log(`· extensions/${name} 已存在，跳过`);
      continue;
    }
    copyFileSync(src, path.join(destExt, name));
    log(`✓ extensions/${name}`);
  }
  warn(
    '注意：question.ts / compaction-no-thinking.ts 依赖全局的 pi 工具链；' +
      '拷进来若报依赖错误，把该扩展挪到项目的 .pi/extensions/ 下由 pi 自己解析。',
  );
}

log('');
log('完成。目录结构：');
log(`  ${path.relative(repoRoot, agentDir)}/settings.json    默认模型`);
log(`  ${path.relative(repoRoot, agentDir)}/models.json      provider + key`);
log(`  ${path.relative(repoRoot, sessionDir)}/               会话记录`);
log('');
log('想临时回到全局 pi 环境对比：HEARTH_PI_ISOLATE=0 npm run dev');