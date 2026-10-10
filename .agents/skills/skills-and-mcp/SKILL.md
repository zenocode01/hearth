---
name: skills-and-mcp
description: 'Use for extending the assistant with capabilities: Agent Skills (local SKILL.md files, progressive disclosure via activate_skill) and MCP servers (Streamable HTTP, tools merged into the chat tool set). Covers lib/skills, lib/mcp, the /skills and /mcp pages, and the mcp_servers table.'
---

# 扩展助手能力：Skills 与 MCP

两条路给助手加能力，都接到我们已有的工具体系（`lib/llm/tools.ts` + `streamText({ tools })`）：

- **Skills（技能）**：本地 `SKILL.md` 文件，模型按需加载（渐进式披露）。
- **MCP**：外部 MCP server 的工具并进对话。

## Agent Skills

**一个技能 = 一个目录**，根目录 `SKILL.md`（YAML frontmatter 至少 `name` / `description`，
可带 `references/` 等资源）。放在 **`data/skills/<id>/`**（`data/` 不入 git；env
`HEARTH_SKILLS_DIR` 可改）。

| 层 | 位置 |
|---|---|
| 发现/读取 | `lib/skills/store.ts`：`listSkills` / `findSkill` / `readSkillResource`（带路径穿越校验）；自己用正则解析 frontmatter（只认 name/description，**不引 yaml 依赖**） |
| 提示词+工具 | `lib/skills/agent.ts`：`buildSkillsPrompt`（拼 `<available_skills>`，只给名字+描述；CLI 版带 SKILL.md 绝对路径）+ `buildSkillTools`（`activate_skill` / `read_skill_reference`，**没技能就不注册**） |
| 接口/页面 | `app/api/skills/route.ts`（只读列表）+ `app/skills` + `features/skills/SkillsView.tsx` |

**两条链路注入方式不同**：
- 内置模型：技能目录拼进 `instructions`，命中后调 `activate_skill` 读正文；
- 外部 CLI（pi）：技能目录（**带 SKILL.md 路径**）交给 `buildCliPrompt`，pi 用自己的 `read` 工具读。

## MCP（Streamable HTTP）

依赖 `@modelcontextprotocol/sdk`（**声明 node≥22.22**，本机 22.20 实测可用）。只做 HTTP，
不做 stdio（依赖桌面/IPC）、不做 OAuth/市场。

| 层 | 位置 |
|---|---|
| 配置表 | `mcp_servers(id, name, url, headers, enabled, …)`（迁移 0010）；读写 `lib/db/mcpServers.ts` |
| 客户端 | `lib/mcp/client.ts`：`Client` + `StreamableHTTPClientTransport`；进程内 `Map` 缓存 client+工具清单（5 分钟 TTL）、`MCP_TIMEOUT` 默认 30s、失败静默降级 |
| 工具转换 | `lib/mcp/tools.ts`：`buildMcpTools` 转成 AI SDK tool，名字 **`mcp__<serverId>__<toolName>`**（工具名只留 `[A-Za-z0-9_-]`）；某个 server 连不上只跳过它 |
| 接口/页面 | `app/api/mcp/servers`(+`/[id]`) 增删改查、`/api/mcp/test` 测试连接；`app/mcp` + `features/mcp/McpView.tsx` |

聊天路由（`app/api/chat/route.ts`）在内置分支里 `await buildMcpTools(listEnabledConfigs())`
并进 `tools`。入口在侧栏 Agent 切换器 popover（「技能」「MCP」）。

## 关键坑（都踩过）

- **MCP server 的 engine 要求**：`@modelcontextprotocol/sdk` 声明 node≥22.22，本机 22.20 会
  报 `EBADENGINE` 警告但**实测可用**；升级 node 后警告消失。
- **MCP 工具名要 sanitize**：provider 对函数名有字符限制；统一 `mcp__<serverId>__<toolName>`
  并把非法字符换成 `_`。server 连不上**只跳过它**，不能把整个对话弄挂。
- **MCP 客户端要缓存**：每次请求都新建连接会很慢；用模块级 `Map`（key = id+url+headers），
  配置改动后 `clearMcpCache()`。
- **技能 frontmatter 自己解析**：只取 `name`/`description`，别为它引入 `yaml`/`gray-matter`。
- **技能目录在 `data/`（gitignore）**：示例技能不会进 git；要随项目分发就改 `HEARTH_SKILLS_DIR`
  指到跟踪目录。
- **CLI 与内置注入路径不同**：CLI 给路径（它自己 read），内置给工具（`activate_skill`）。

## 怎么验收

- Skills：`data/skills/haiku/SKILL.md`（要求 5-7-5 三行）→ 问"用俳句写秋天"，模型先调
  `activate_skill` 再按技能作答。
- MCP：起一个最小 MCP server（Streamable HTTP 暴露 `echo`）→ `/api/mcp/test` 应返回工具清单 →
  添加后聊天里模型调用 `mcp__<id>__echo`，结果回填。

> 联调脚本放 `scripts/`，用完删（仓库里只留 `mock-llm.mjs`）。
