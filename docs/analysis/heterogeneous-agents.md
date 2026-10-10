# LobeHub「接入其他智能体」（异构 Agent）深度分析

> 只读分析 `refs/lobe-chat/`（LobeHub 快照）。目的：为 Hearth 的「外部 CLI Agent」这条线
> 提取**设计方法**与**具体实现**。所有路径以 `refs/lobe-chat/` 为根（下文省略前缀）。
>
> 异构智能体 = 外部 CLI/Agent（Claude Code、Codex、Cursor、Devin、Droid、Qoder、Kimi Code、
> opencode、pi、amp、codebuddy、grok-build、trae…）。它们**自带工具链、记忆、会话**，
> LobeHub 只负责「接入 + 呈现 + 审批」。

---

## 1. 总览：为什么要单独一条链路

原生聊天是「LobeHub 自己调模型 + 自己跑工具」；异构是「把一轮任务**委托**给外部进程，
把它的输出**翻译**成 LobeHub 的消息」。两者在 LobeHub 里是**两条 runtime**，共用消息模型与渲染，
但运行/工具/审批/动作栏有专门适配。

设计上分四层：

| 层 | 职责 | 关键位置 |
|---|---|---|
| 描述符（descriptor） | 每个 agent 的元数据：命令、安装、认证、resume、图标 | `packages/types/src/agent/heterogeneousAgent.ts` |
| 适配器（adapter） | 把各 agent 的协议转成统一内部事件 | `packages/heterogeneous-agents/src/{registry.ts,adapters/*}` |
| 运行器（executor/dispatch） | 选 runtime、spawn、喂事件、落库 | `src/store/chat/slices/agentRun/actions/{dispatch,transports/hetero}`、`apps/desktop/.../HeterogeneousAgentImpl.ts` |
| 交互层 | 工具卡片、干预、动作栏、状态 | `packages/builtin-tools/**`、`src/features/Conversation/**` |

---

## 2. 单一事实来源：描述符目录

`packages/types/src/agent/heterogeneousAgent.ts`

- `LocalHeterogeneousAgentDescriptor`（L23）：`type / title / iconId / defaultCommand /
  install{commands,docsUrl} / auth{patterns,signInCommand,docsUrl,errorMessage} /
  resume{supported} / defaultTopicGroupMode / kind:'local-cli'`。
- `HETEROGENEOUS_AGENT_CONFIGS`（L54）：13 个 local agent 的完整元数据一处定义。
- `REMOTE_HETEROGENEOUS_AGENT_CONFIGS`（L417）：`openclaw/hermes`（kind=`remote-task`）。
- 读取器：`packages/heterogeneous-agents/src/config.ts` 的 `getHeterogeneousAgentConfig /
  resolveHeterogeneousAgentCommand / isLocalHeterogeneousType`。

**设计方法**：命令、安装、认证、resume 方式**只写一份**，spawn 层与 UI 层都读它——
避免「界面说这样、实际那样跑」。旧的 `HETEROGENEOUS_AGENT_MODEL_IDS`（`packages/const`）
让老数据靠 `model` 字段也能路由到异构路径。

**适配器注册表** `packages/heterogeneous-agents/src/registry.ts`：
```ts
const localAgentRegistry = {
  'claude-code': { createAdapter: () => new ClaudeCodeAdapter() },
  'codex':       { createAdapter: () => new CodexAdapter() },
  'pi':          { createAdapter: () => new PiAdapter() },
  ...
} satisfies Record<LocalHeterogeneousAgentType, AgentRegistryEntry>;
```
`createAdapter(type)` 造适配器；适配器实现见 `src/adapters/`（`claudeCode.ts`/`codex.ts`/
`opencode.ts`/`pi.ts`/`acpCommon.ts`…）。

---

## 3. 运行链路

### 3.1 三态 dispatcher

`src/store/chat/slices/agentRun/actions/dispatch/agentDispatcher.ts`

- `AgentRuntimeType = 'client' | 'gateway' | 'hetero'`。
- `selectRuntimeType(ctx, {isDesktop})`（L120）优先级 **`parentRuntime` > `hetero`(仅桌面)
  > `gateway` > `client`**；remote hetero → `gateway`；local CLI → `resolveExecutionTarget`
  决定 `hetero` 还是 `gateway`。

### 3.2 客户端执行器

`.../transports/hetero/heterogeneousAgentExecutor.ts`（`executeHeterogeneousAgent`，L489）：

1. `subscribeBroadcasts` 订阅 IPC `heteroAgentEvent`；
2. 经 `heterogeneousAgentService` spawn；
3. 主进程内 `AgentStreamPipeline` 做 JSONL framing + adapter + `toStreamEvent`；
4. 事件喂 `createGatewayEventHandler`；
5. 工具消息由 `messageService` 先建行再发事件。

### 3.3 spawn 与事件管线

- `packages/heterogeneous-agents/src/spawn/spawnAgent.ts`：`buildSpawnArgs`（按 type 拼参数，
  resume 各不同：claude `--resume`、codex `exec resume`、opencode/kimi `--session`、
  amp `threads continue`；**`buildPiArgs` 故意抛错——pi 只能走 RPC**）。
- `spawn/agentStreamPipeline.ts`：`stdout chunk → JsonlStreamProcessor → adapter →
  toStreamEvent`；`toStreamEvent` 给事件打 `operationId`。

### 3.4 pi RPC（与我们最相关）

`packages/heterogeneous-agents/src/rpc/`：
- `piRpcProtocol.ts`：命令/事件 wire 类型（`prompt/steer/abort/get_state/set_model/
  set_thinking_level`…）、终止事件 `agent_settled`、`PI_RPC_MIN_CLI_VERSION`。
- `piRpcSession.ts`：`start()` 用 `get_state` 握手取 native sessionId；`run(prompt)` 把
  事件 JSONL 化后**复用同一个 `AgentStreamPipeline`**；`abort()` 先 RPC 再关进程；
  `followUp/steer/compact`；非活动超时 `armInactivityTimer`。

**设计方法**：协议差异全部收敛在 adapter；上层（消息/渲染/审批）对协议无感。

---

## 4. 事件 → 消息的适配

### 4.1 统一内部事件

`packages/heterogeneous-agents/src/types.ts`：
```ts
export type HeterogeneousEventType =
  | 'stream_start' | 'stream_chunk' | 'stream_end' | 'stream_retry'
  | 'visible_output_end' | 'tool_start' | 'tool_end' | 'tool_result'
  | 'step_complete' | 'agent_runtime_end' | 'error';
```
1:1 映射到 LobeHub 的 `AgentStreamEvent`，可直接喂事件处理器。各 adapter 负责翻译
（CC stream-json / Codex JSON / OpenCode JSONL / ACP JSON-RPC）。

### 4.2 provenance（溯源）

`packages/types/src/message/common/metadata.ts`（L265）：
```ts
heteroMessageId: z.string().optional(),
heteroSessionId: z.string().optional(),
heterogeneousToolStateOperationId: z.string().optional(),
heterogeneousToolStateSeq: z.number().int().positive().optional(),
```
- **每条消息**盖 `heteroSessionId`（topic 级只留最新值）——这样 resume 失败（静默开新会话）
  时，diff 消息就能定位「在哪一行断了」，否则无法归因。

### 4.3 工具状态：replace-only 快照 + 单调 seq

`types.ts` L206：
```ts
export interface ToolStateChunkData {
  chunkType: 'tool_state';
  pluginState: Record<string, unknown>;
  snapshotMode: 'replace';
  snapshotSeq: number;   // 在 (operationId, toolCallId) 内单调
  toolCallId: string;
}
```
语义：运行中的工具状态**整块替换**（非增量 patch）；`snapshotSeq` 单调，消费端（客户端/服务端/DB）
都做 `seq <= 已应用` 就丢弃；最终 `tool_result` 是权威终态。
`heterogeneousToolStateOperationId` 做作用域，使**下一轮 seq 从 1 重开**。

### 4.4 会话连续性

- `transports/hetero/heteroResume.ts` 的 `resolveHeteroResume`：CC 的 session 按 cwd 存在
  `~/.claude/projects/<cwd>/`，**cwd 变化必须放弃 resume**；`getNativeHeteroSessionBindingKey`。
- 按 cwd 分桶：`src/helpers/heteroSessionByWorkingDirectory.ts`；写回 topic metadata 的
  `heteroSessionIdByWorkingDirectory`（`persistResumeSessionId`）。
- 失败自愈：`retryWithoutResume`（遇 `ResumeCwdMismatch` 且尚未流式产出 → 清 stale 重跑）。

---

## 5. 会话交互层适配

### 5.1 工具卡片：四套注册表 + identifier→apiName

`packages/builtin-tools/src/{renders,inspectors,streamings,register}.ts`：
- `getBuiltinRender(identifier, apiName)`（结果卡）
- `getBuiltinInspector`（折叠标题）
- `getBuiltinStreaming`（参数流式期的临时渲染）
- `getBuiltinRenderDisplayControl`（`collapsed/expand/alwaysExpand`，可依 result 动态）

**异构 CLI 直接复用本地工具卡**（`register.ts` L204/216/222）：
```ts
const heterogeneousCliRenders = {
  bash: RunCommandRender, read: LocalSystemRenders[readFile], write: LocalSystemRenders[writeFile],
};
[PI_IDENTIFIER]: heterogeneousCliRenders, [OPENCODE_IDENTIFIER]: heterogeneousCliRenders,
```
Codex 有 `file_change / command_execution / todo_list / mcp_tool_call / web_search…`
（`builtin-tools/src/codex/**`）；Claude Code 有整套 `builtin-tool-claude-code/src/client/**`
（`Render/Streaming/Inspector` 三目录）；Kimi Code 有 `kimiCode/**`。

**参数流式复用结果组件**：`builtin-tool-claude-code/src/client/Streaming/wrapRender.tsx`
把结果 `Render` 包成 streaming（`content:null`，header-only）——**live/final 视觉一致**。

**partial args**：`Detail/Arguments/index.tsx` 用 `partial-json` 容忍半截 JSON。

### 5.2 干预：form vs binary

`packages/types/src/tool/intervention.ts` 的 `classifyToolInterventionPresentation`（L183）：
- `askUserQuestion` + 异构标识 → `{interactionKind:'question', surface:'form'}`
- 异构标识 → `{interactionKind:'custom', surface:'form'}`
- 否则 → `{interactionKind:'tool_approval', surface:'binary'}`

**回答送回**：`Messages/AssistantGroup/Tool/Detail/Intervention/index.tsx` 对异构走
`submitHeteroIntervention(id, type, payload)`——经 **IPC 送回正在运行的 CLI 子进程**，
**不是**起新 client turn（`conversationControl.ts` L1784：本地 → IPC；远程 → tRPC）。

**停止 ≠ 拒绝**（`InterventionController.stopPendingApproval`，L271 注释）：
- reject：写原因，让模型**继续回应拒绝**；
- stop：**直接结束这一轮，什么都不执行**（就地结算 pending tool 行为 `aborted`）。

### 5.3 动作栏按 runtime 覆写

`src/routes/(main)/agent/features/Conversation/useActionsBarConfig.ts`：
```ts
const HETERO_USER = { bar:['copy'], menu:['restoreToInput','copy','divider','select','divider','del'] };
const HETERO_ASSISTANT = { bar:['copy'], menu:['copy','divider','select','divider','del'] };
const CODEX_ASSISTANT = { bar:['copy','regenerate'], menu:['regenerate', ...HETERO_ASSISTANT.menu] };
```
**为什么**：外部 runtime 拥有 assistant 消息生命周期，edit/branching/translate/share 都不适用；
但 **`restoreToInput` 要保留**——长 CLI run 失败/丢上下文时把原 prompt 拉回输入框重试；
Codex 因为有异构 rerun 路径才额外给 `regenerate`。

### 5.4 推理：零专门处理

异构把 reasoning 存成 `message.reasoning = { content }`，走**同一个** `Reasoning.tsx` /
`Thinking` 组件，无任何 hetero 分支（pi 适配器把 `thinking_delta` 映射为 `chunkType:'reasoning'`）。

### 5.5 状态与错误

- Topic 状态视觉 `src/components/ExecutionStatus.ts`：`waitingForHuman` 用**举手图标**；
  `failed` 用告警（"需处理"非终态）。
- 判定 `store/chat/utils/interventionSync.ts`：`isInterventionRunActive = running || waitingForHuman`。
- 异构专属错误码 `src/features/Conversation/Error/heterogeneous.ts`：
  `AuthRequired / CliNotFound / Overloaded / RateLimit / WorkingDirectoryNotFound /
  CliDetectionTimeout` → 各有一张状态指引卡（`features/Electron/HeterogeneousAgent/StatusGuide/states/*`）。
- 进程失败分类 `spawn/classifyProcessFailure.ts` + `errors/taxonomy.ts`。

### 5.6 能力门与选择器

- `packages/types/src/agent/heteroSelectorCapabilities.ts`：每个 CLI 声明 `model/effort/mode/speed`
  维度、编码方式（`--flag` 或 `-c key=value`）、`resolve`；Codex 专属
  `CODEX_ULTRA_REASONING_MODELS`。`applyHeteroSelection` 切换时**清掉冲突 flag**。
- 异构的"模型"是 **CLI 级**（不是 model-bank）；`'default'` = 不覆盖。
- 输入栏 `HeterogeneousChatInput`：**LobeHub 侧的工具/记忆 picker 基本不适用**
  （leftActions 为空），只留 voice；sendArea 放 `HeteroModel` 选择器。

---

## 6. 对 Hearth（家用配方）的可借鉴清单

我们现状：单进程 Next.js、spawn CLI（pi RPC / opencode / claude 文本）、已隔离 pi 环境、
无 IPC / 无 device / 无 gateway / 无 hetero 概念。

| # | 借鉴 | LobeHub 做法（路径） | 我们怎么做 |
|---|---|---|---|
| 1 | **描述符目录当唯一事实来源** | `packages/types/src/agent/heterogeneousAgent.ts` | 建 `lib/llm/heteroAgents.ts`：`{type,title,command,baseArgs,resumeFlag,protocol}`，spawn 与 UI 都读它 |
| 2 | **统一内部事件 + 每 agent 一个薄 adapter** | `heterogeneous-agents/src/{types,registry,adapters}` | 定义 `AgentEvent`（start/chunk/tool_start/tool_result/end/error），pi/opencode/claude 各写一个 adapter 归一 |
| 3 | **工具卡片三层注册表** | `builtin-tools/src/{renders,inspectors,streamings}.ts` | 拆 `getInspector/getStreaming/getRender`，按 `identifier+apiName` 注册；pi 的 bash/read/write 复用本地卡 |
| 4 | **form vs binary 干预分类** | `packages/types/src/tool/intervention.ts` | 加 `classifyIntervention(identifier, apiName)`；form 走内联表单，binary 才 approve/reject |
| 5 | **停止 ≠ 拒绝** | `InterventionController.stopPendingApproval` | 提问/审批卡加「到此为止」（丢弃整批不续跑）与「拒绝并附理由」两个动作 |
| 6 | **动作栏按 runtime 覆写** | `useActionsBarConfig.ts` | 外部 CLI 会话隐藏 edit/branching/regenerate，保留「放回输入框」 |
| 7 | **推理复用原生 Thinking** | `Reasoning.tsx` 无 hetero 分支 | pi 的 thinking 归一为 `message.reasoning.content`，不新做组件 |
| 8 | **安装检测 + 可读错误卡** | `spawn/resolveCliCommand.ts` 的 `detectHeterogeneousCliCommand` | 首次发消息探测 `which/--version`，失败返回带安装命令的卡片，而非 spawn ENOENT |

### 不建议抄（重型基建）

- **Electron IPC / device gateway / 云 sandbox**（`HeterogeneousAgentCtr.ts`、
  `executionTarget.ts`、`heteroDispatch.ts`、operation JWT、`agent_operations` 表）。
- **三态 dispatcher（client/gateway/hetero）**：单进程只需「本地 spawn」一条路。
- **provenance 快照体系**（per-message `heteroSessionId` + `heterogeneousToolStateSeq` +
  服务端 seq 水位/冷副本恢复）：单机单进程「最后写入即真相」足够。
- **多 agent 能力矩阵**（`HETERO_SELECTOR_CAPABILITIES` 14×4）：只接 1~2 家，硬编码即可。
- **ACP / Codex app-server / Claude Agent SDK 多传输**：除非明确要 cursor/droid/devin。
- **干预审批全栈**（`agent_interventions` 表、密封批次/outbox/lease、Global approval）。
- **崩溃 inflight 账本 + transcript replay**：除非做桌面重启恢复。

---

## 7. 一句话总结

LobeHub 的异构接入，可抄的内核是四件事：
**① 描述符目录（一份元数据驱动 spawn 与 UI）→ ② 统一事件 + 薄 adapter（协议差异收敛在适配器）
→ ③ 工具卡片/干预/动作栏按 runtime 做「分层注册 + 覆写」→ ④ 停止与拒绝语义分离**。
其余（IPC、device、gateway、沙箱、provenance 快照、多 agent 矩阵）都是**分布式/桌面容器**
带来的复杂度，家用配方没有对应约束，照抄只会拖垮小步开发。
