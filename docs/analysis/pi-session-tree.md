# 移植 pi 的 session / tree 到 Hearth（方案）

> 状态：**进行中**（S1 已实现，待人工验收）。决策已定：α（pi 管历史）＋ 同 topic 内兄弟分支 ＋ 外接 pi 用 pi 原生技能/MCP、Hearth 自身用自己那套。
> 目标：把外部 CLI（pi）的**会话管理**与**会话树**接进 Hearth，让「分支 / 树 / 上下文用量 / 压缩」这些能力由 pi 原生提供，而不是我们在 DB 上自造。

## 0. 验证记录（2026-10-10，本机实测）

- `pi --mode rpc --session-id top_xxx` **接受自定义 id**（非 UUID 也行），`get_state` 返回 `sessionId=top_xxx`、`sessionFile=.pi-runtime/sessions/<ts>_top_xxx.jsonl`、`contextWindow=262144`。
- 两次 `pi --print --session-id top_e2e_probe` 端到端：第二轮正确记起第一轮（回答 `alpha`）→ **会话持久化成立**。
- 隔离环境 `.pi-runtime/agent/` 下已有 `mcp.json`（pi 原生 MCP）、`models.json`、`settings.json`；pi 原生技能从 `.agents/skills/` 自动发现。
- pi 的 `contextWindow`（262144）与我们 `getContextWindow` 的估算可能不同 —— S4 改用 pi 的 `get_session_stats`。

## 1. 现状（我们要替换的东西）

| 能力 | 现状 | 问题 |
|---|---|---|
| 会话历史 | 每轮从 `messages` 表重建，全量塞进 prompt | pi 每轮是**无状态**新进程，没有真正的多轮记忆 |
| 分支 | `POST /api/topics/[id]/branch`：复制 DB 消息到新 topic | 只是"复制文本"，与 pi 的会话树无关 |
| 压缩 | 我们自研（`topic_summaries` + 水位线） | 与 pi 自己的 compaction 并行、互相不知道 |
| 上下文用量 | 我们估算（`ContextMeter`） | pi 有精确的 `contextUsage` |
| 思考/工具 | 已对齐（`set_thinking_level` / 工具事件） | — |

pi 的启动命令是 `pi --mode rpc --system-prompt "{{systemPrompt}}"`，**没带 `--session-id`**，所以每次都开新会话。

## 2. pi 的会话模型（读源码 + 官方 docs 确认）

- **会话 = 一棵树**。JSONL 文件，每行一个 entry，`id` / `parentId` 串成树；`leaf` = 当前位置。导航到旧节点**不删除**离开的分支。
- 文件路径：`<session-dir>/.../<timestamp>_<session-id>.jsonl`。`--session-id <id>` 表示"用这个 id，没有就创建"；`--fork <id>` 从节点派生**新会话文件**；`--continue` / `--resume` / `--session-dir` / `--no-session`。
- **压缩**：`compaction` entry（带 `firstKeptEntryId`），自动（超阈值）+ 手动 `/compact`；`context_edit` 能改"发给模型的上下文"而不改原始历史。切分支时还能生成 `branch_summary`。
- **RPC 原生命令**（`stdin` JSONL，`docs/rpc-commands.md`）：
  - 会话：`get_state`（sessionId / sessionFile / messageCount / thinkingLevel…）、`get_messages`、`get_entries`（**游标式**、含被压缩与被放弃的分支）、`get_tree`、`get_fork_messages`、`switch_session`、`new_session`、`set_session_name`
  - 分支：`fork`（从某 user message 派生**新会话**）、`clone`（复制当前分支为新会话）
  - 上下文：`compact`、`set_auto_compaction`、`get_session_stats`（含 `contextUsage.{tokens,contextWindow,percent}`）
- **RPC 没有"会话内跳 leaf"的命令**。但 RPC 模式给**扩展的 command context** 接了 `navigateTree(targetId)`（源码 `dist/modes/rpc/rpc-mode.js` 的 `commandContextActions`），扩展命令可通过 `prompt` 里的 `/命令名` 触发 → **我们可以用一个自研扩展补上会话内树导航**。
- **事件**（`docs/json.md`）：`compaction_start` / `compaction_end`、`session_info_changed`、`thinking_level_changed`、`entry_appended`、`agent_settled`。

## 3. 关键取舍：谁管历史

这是整个方案的岔路口。

### 方案 α —— **pi 管历史**（真正的"移植"，推荐）
- 每个 topic ↔ 一个 pi 会话：用 `--session-id <topicId>`（我们的 `top_xxx` 是文件系统安全的），1:1 映射。
- 每轮只发**本次新消息**，历史由 pi 从会话文件加载。
- 压缩交给 pi（我们关掉 pi 主题的自研压缩）；上下文用量取 `get_session_stats`。
- DB 仍存消息，但降级为**UI 镜像**（渲染 / 刷新恢复）。
- ✅ 真正的多轮记忆、原生树、原生压缩、原生用量。
- ⚠️ 代价：**在 UI 里删消息 / 重新生成，不再影响 pi 的上下文**（要同步就得走 pi 的 `context_edit` / `navigateTree`）；我们自研的 `topic_summaries` 对 pi 主题失效。

### 方案 β —— DB 管历史，pi 只做"树视图"
- 保留现状（每轮发全量 + 我们的压缩），只用 `get_tree` **只读**展示分支。
- ✅ 改动小、不动现有事实来源。
- ❌ "移植"不彻底：树是展示用的，和我们真正发给模型的历史**可能不一致**（pi 会话里没有我们的摘要，也没有我们删掉的消息）。

> 建议：既然目标是"移植 pi 的 session 管理"，选 **α**。β 只是换个 UI 说法，没有本质收益。

## 4. 方案 α 的映射设计

| Hearth | pi | 备注 |
|---|---|---|
| `topic.id` | session id（`--session-id`） | 1:1，无需新列 |
| 一轮对话 | `prompt`（只发新消息） | 不再拼历史 |
| 人设 | `--system-prompt`（每轮带） | pi 存成 section patch |
| 技能 | 改用 pi 原生 `--skill <dir>`？ | 或继续注入 prompt（待定，见 §6） |
| 消息 | DB 镜像 + `messages.cliEntryId`（新列） | 树导航/分支点需要 entry id |
| 分支 | `fork(entryId)` → 新会话 → 新 topic；或 `navigateTree(entryId)` → 同会话兄弟分支 | 见 §6 |
| 压缩 | pi 自动 + `/compact`（RPC `compact`） | 我们不再注入摘要 |
| 上下文用量 | `get_session_stats.contextUsage` | 替换 `ContextMeter` 的估算 |
| 会话重命名 | `set_session_name` | 与 topic.title 同步 |
| 删除会话 | 删 session 文件 | 现在删 topic 不删 pi 会话（会残留） |

`messages.cliEntryId` 的来源：每轮结束后用 `get_entries`（游标）拉新 entry，按顺序与我们刚落库的消息对账。

## 5. 分阶段（每步一个 commit，可独立验收）

- **S1｜pi 会话持久化** ✅（已实现，待验收）：RPC 启动加 `--session-id <topicId>`；只发本次新消息；pi 主题关闭自研压缩与技能注入；手动压缩按钮对 pi 主题明确拦下。
  - 验收：同一 topic 连续多轮，pi 记得上下文（换进程后仍在）。
  - 待补（S5）：删 topic 时清掉对应的 pi 会话文件。
- **S2｜消息 ↔ entry 映射**：`messages` 加 `cliEntryId`；每轮 `get_entries` 对账落库。
  - 验收：DB 消息能定位到 pi entry。
- **S3｜树视图 + 分支**：
  - 新增自研扩展 `hearth-tree`（注册 `/hearth-navigate`、`/hearth-fork`），补 RPC 缺失的会话内导航；
  - UI：会话树选择器（`get_tree`）+ 「分支」动作改为对 pi 主题走 fork / navigateTree。
  - 验收：能从某条消息派生分支、能在树里切换、切换后上下文正确。
- **S4｜用量与统计来自 pi**：`ContextMeter` 改用 `get_session_stats`。
- **S5｜会话生命周期对齐**：重命名（`set_session_name`）、删除（清 session 文件）。

## 6. 待确认

1. **选 α 还是 β？**（建议 α）
2. **分支语义**：`fork` 派生**新 topic**，还是 `navigateTree` 在**同一 topic 内**开兄弟分支（更贴近 pi 的 `/tree`）？（建议后者，与"tree 功能"一致）
3. **技能/工具注入**：是否顺势改用 pi 原生（`--skill` 目录、MCP 交回 pi 管），还是维持现状（我们注入 prompt）？先维持、后续再评估也可。
4. **隔离环境**：pi 会话目录沿用 `.pi-runtime/sessions`（已 gitignore），OK？
