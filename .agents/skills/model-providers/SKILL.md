---
name: model-providers
description: 'Use for LLM provider integration: API keys, model list, connection test, OpenAI-compatible and Tongyi adapters. Blueprint L1-4.'
---

# 模型与密钥接入（L1-4）

只做 **1~2 家**：OpenAI 兼容接口 + 通义（阿里）。key 存数据库；"测试连接"按钮。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/packages/model-runtime/src/providers/` —— 适配器思想（我们只写 1~2 个）
- `refs/lobe-chat/.agents/skills/add-model-provider/SKILL.md` —— 接入一家 provider 的完整清单（大幅简化后使用）
- `refs/lobe-chat/packages/model-bank/` —— 模型元数据思想（我们用硬编码列表起步）

## 简化版做法

1. `lib/llm/`：一个 provider 接口（`listModels` / `chat` / `stream`），两个实现：
   - `openai-compatible.ts`（OpenAI 及一切兼容端点）
   - `tongyi.ts`（通义 DashScope；若用其 OpenAI 兼容模式可复用上一实现）
2. key 与模型配置存 DB（settings 表或独立表），**不进代码、不进 git**。
3. `app/settings/`：填 key、选模型、"测试连接"（发一句固定问题）。
4. `app/api/chat` 只依赖 `lib/llm` 接口，不直接 import 具体 provider。

## 安全

- key 只存服务端（DB / 环境变量），**永远不**进前端 bundle 或日志。
- 错误信息脱敏：不把 key 片段回显给用户。

## 验收（阶段 1 的依赖项）

- [ ] 至少 1 家可配 key + 测试连接通过
- [ ] 换 key / 模型后立即生效
- [ ] 错 key 时报错可读

## 常见翻车

- 通义报错"invalid API key" → 检查是 DashScope 专用端点还是 OpenAI 兼容端点，两套 baseURL 不要混。
- 模型列表为空 → provider 的 listModels 未实现或 key 权限不足，先用硬编码列表兜底。
