# Hearth 聊天界面 vs LobeHub 对话界面（对比 + 改善方向）

> 状态：分析文档（不改代码）。出处：LobeHub 侧 = `refs/lobe-chat/`（只读参考）；Hearth 侧 = 本项目 `features/chat/`。
> 定位提醒：Hearth 是「家用配方」（LobeHub 的 3~5%），**不追求功能齐全**，只挑高杠杆项。下文标 ⭐ 的是"小改动、体感提升大"。

## 0. 一句话总览

LobeHub 的对话界面是一套**重状态、重折叠、重反馈**的系统：虚拟列表 + 单例动作栏 + 整轮"过程折叠" + 丰富的加载/错误/流式反馈 + 编辑器级输入区（提及/斜杠/草稿/历史）。
Hearth 是**扁平直给**：朴素渲染所有消息、内联动作栏、基础推理/工具卡、textarea 输入区。**核心心智一致**（用户气泡 / 助手扁平 / 推理折叠 / 工具卡 / 悬停动作），差距主要在**长会话性能、整轮折叠、消息头与时间、编辑、输入区能力**。

---

## 1. 布局与滚动

| 维度 | LobeHub | Hearth | 差距 |
|---|---|---|---|
| 列表 | `virtua` 虚拟化 + 合成前导行（`ChatList/components/VirtualizedList.tsx`） | `messages.map` 全量渲染（`features/chat/index.tsx`） | ⭐长会话性能/内存 |
| 发送滚动 | 发消息时插入"全视口 spacer"，把用户消息钉在顶部、助手在下方填充（`ChatList/hooks/useConversationScroll.ts`） | `scrollToBottom` + 底部跟随 | ⭐体感明显更好 |
| 流式行 | 保持挂载（避免 markdown 动画重播）（`VirtualizedList.tsx`） | 无虚拟化，天然保持 | — |
| 回到最新 | `BackBottom`（ActionIcon 玻璃圆钮） | `BackBottom.tsx`（已对齐） | ✅基本一致 |
| 历史分页 | 前导行滚动触发 `useEarlierHistoryTrigger` | 无 | 低优先 |
| 迷你地图 | `ChatMiniMap`（长会话导航条） | 无 | 低优先 |
| 滚动位置 | 按话题恢复（`useTopicScrollPersist`） | 无（切回会到顶部/底部） | 中 |

## 2. 消息渲染

| 维度 | LobeHub | Hearth | 差距 |
|---|---|---|---|
| 统一容器 | `ChatItem`（头像 + 标题 + 相对时间 + 内容 + 动作行）（`Conversation/ChatItem/ChatItem.tsx`） | `MessageItem`（只渲染片段：推理/工具/Markdown）（`features/chat/MessageItem.tsx`） | ⭐缺头像/名字/时间 |
| 用户/助手 | 用户气泡、助手扁平（同 Hearth 思路） | 同 | ✅一致 |
| 时间/动作行 | `opacity:0` 常驻、hover 才显（不引起布局抖动）（`ChatItem/style.ts`） | 动作行 CSS 悬停显示（`globals.css` `.hearth-msg-actions`）；**无时间** | ⭐补相对时间 |
| 推理 | `Thinking` Accordion：思考中自动展开 + spinner，结束收起成 "Thought for Ns"（`Conversation/components/Thinking/`） | `ReasoningBlock.tsx`：思考中展开+转圈，结束收起"已深度思考 N 秒"，可手动开合 | ✅已对齐（措辞略不同） |
| 工具 | Accordion 行：**状态字形**（运行/待批/成功/警告/错误/拒绝/中止）+ **实时执行计时** + 展开看详情；按 manifest 决定默认展开（`AssistantGroup/Tool/`） | `ToolCard.tsx`：图标+中文名+摘要+状态文字，可展开看参数/结果；todo 专属卡 | ⭐状态用字形 + 执行计时 |
| 引用来源 | `SearchGrounding`：折叠 pill + favicon 堆叠 → 展开来源卡（`Messages/components/SearchGrounding.tsx`） | 无 | 视是否接搜索工具 |
| 流式反馈 | `ContentLoading`：网络 Spin + **操作感知文案**（"Claude Code is running…"）+ 计时（`Messages/components/ContentLoading.tsx`） | "模型思考中…"（单一文案） | ⭐文案+计时 |
| 整轮折叠 | **`ProcessFold`/`WorkflowCollapse`**：把一轮的推理+工具+中间正文折成一行（"ran for N steps · 3m37s"），最终答案始终可见 | 无（推理/工具逐条铺开） | ⭐⭐最大"精致感"来源 |

## 3. 消息动作栏

| 维度 | LobeHub | Hearth | 差距 |
|---|---|---|---|
| 架构 | 声明式 **slot 注册表** + **单例 portal**（一个动作栏移动到 hover 的行）（`MessageActionBar/index.tsx`、`MessageActionProvider.tsx`） | 每条消息内联 `ActionIconGroup`（`MessageActions.tsx`） | ⭐单例 portal；注册表 |
| 动作集 | copy/edit/regenerate/delAndRegenerate/del/branching/share/translate/select/restoreToInput/continue/collapse/comments/advanced | 复制/放回输入框/重新生成/分支/删除 | 按需增补 |
| 权限/运行时 | 权限降级成 `['copy','comments']`；异构 agent（Claude Code）极简栏（`useActionsBarConfig.ts`） | 只有 `canBranch`/`canDelete` 两个布尔 | ⭐做成"按 runtime/权限的配置" |

## 4. 输入区（composer）

| 维度 | LobeHub | Hearth | 差距 |
|---|---|---|---|
| 结构 | `@lobehub/editor` 的 ChatInput；左 `ActionBar` / 右 `SendArea` / 下方 `ControlBar(28px)`（`ChatInput/Desktop/index.tsx`） | `textarea`；左（附件/思考档/工具/会话树/上下文）/ 右发送·停止（`ChatComposer.tsx`） | 结构一致；控件不同 |
| 左动作 | plus/voice/model/search/tools/memory/params/contextWindow/mention/history/clear/typo/agentMode…（`ActionBar/config.ts`） | 附件/思考档/工具/会话树/上下文 | 够用 |
| 提及 `@` | Fuse 过滤的分类菜单（agents/members/topics/skills/tools/files）（`InputEditor/useMentionCategories.tsx`） | 无 | 中 |
| 斜杠 `/` | 行首命令 + 技能，插入**彩色 action tag**（`useSlashActionItems.ts`） | 无 | 中（至少 `/compact`、`/new`） |
| 草稿/历史 | 草稿持久化 + 跨 composer 草稿总线 + 输入历史（↑/↓）（`useChatInputDraft`、`InputHistoryPopup`） | 无（**发送前刷新会丢草稿**） | ⭐草稿持久化 |
| 全屏展开 | `ComposerExpandButton` 全屏编辑 | 无 | 低 |
| 语音 | 听写 + 语音消息 | 无 | 低 |

## 5. 页头

| 维度 | LobeHub | Hearth | 差距 |
|---|---|---|---|
| 内容 | `NavHeader(44px)`：左(头像/Tags/HeaderActions) 右(IDE/terminal/comments/share/working panel)（`Conversation/Header/index.tsx`） | 顶栏只有 "Hearth" + 主题控件（`features/chat/index.tsx`） | ⭐缺**话题标题 + 操作菜单**（改名/删除/导出都在侧栏） |
| 浮动 | ≥1200px 浮动透明页头 | 固定 | 低 |

## 6. 编辑与分支

| 维度 | LobeHub | Hearth | 差距 |
|---|---|---|---|
| 编辑消息 | modal 编辑（`edit` 动作 / Alt+双击），可编辑用户与助手（`ChatItem/components/MessageContent`、`useDoubleClickEdit.ts`） | 无（只有"放回输入框"重发） | ⭐编辑消息 |
| 编辑=重发 | 编辑**最后一条用户消息**时，确认按钮变 **Send** 并重跑回复 | 无 | ⭐ |
| 分支 | `< n/count >` 切换器（dev）+ thread fork + 多选转发（`MessageBranch.tsx`） | "分支"= 复制新 topic（DB）；pi 主题走会话树（同 topic 内兄弟分支） | pi 侧已更好；内置侧无切换器 |
| 放回输入框 | `restoreToInput`（含编辑器 JSON + 全部附件） | ✅ 有（`restore`） | ✅ |

## 7. 加载 / 错误 / 其它

| 维度 | LobeHub | Hearth | 差距 |
|---|---|---|---|
| 首屏 | `SkeletonList`（保留 header） | `MessageSkeleton.tsx` | ✅ |
| 流式 | 操作感知文案 + 计时 + 重试提示 | "模型思考中…" | ⭐ |
| 错误 | **专用错误卡**（额度/模型/上下文超限/API key/异构状态引导…）+ 重试（`Messages/Error/`） | 单条错误条（可读文案 + 重试） | 中 |
| 停止 | 停止/发送（可双按钮） | 停止 | ✅ |
| 快捷键 | Enter 发送/Shift+Enter、↑↓ 历史、全屏 Cmd+Enter、IME 安全、beforeunload 提醒 | Enter/Shift+Enter、IME 安全 | 中 |
| 深链定位 | 脉冲高亮定位消息 | 无 | 低 |
| 移动端 | 复用 ConversationArea + 移动 ChatHeader + 话题抽屉 | 侧栏变抽屉 + 汉堡 + 安全区（`ui-theming`） | ✅ 基本一致 |

---

## 8. 改善方向（按优先级，小步可落地）

> 原则：挑 ⭐ 高杠杆、改动可控的；每项一个 commit + 人工验收。

### P0 —— 体感提升最明显（建议先做）
1. **整轮"过程折叠"**（学 `ProcessFold`）：一轮里的推理 + 工具 + 中间正文，完成后折成一行摘要（如「已运行 3 步 · 12.4 秒」，可展开），**最终答案始终可见**。这是"精致感"的最大来源，且**纯前端**（用现有 `messages[].parts` 就能分组）。
2. **消息头 + 相对时间**（学 `ChatItem`）：助手消息加头像/名字，右上角相对时间；时间与动作行都 hover 才显（常驻 `opacity:0` 避免抖动）。
3. **发送"钉顶"滚动**（学 `useConversationScroll` 的 spacer，做简化版）：发消息后把用户消息钉在顶部、助手在下方填充；用户上滑即取消。
4. **流式文案升级**（学 `ContentLoading`）：把"模型思考中…"换成操作感知文案（"正在思考…" / "正在调用 bash…"）+ 已用秒数。

### P1 —— 结构性、收益大
5. **消息动作栏改单例 portal + 声明式 slot**（学 `MessageActionProvider`）：一个动作栏移动到 hover 行；把 pi/内置/权限差异做成**配置**而非散落的布尔。
6. **编辑消息**（modal）+ **编辑最后一条用户消息 = 编辑并重发**（学 `useDoubleClickEdit` / `shouldSendOnConfirm`）。
7. **草稿持久化 + 输入历史**（↑/↓）：发送前刷新不丢草稿；这是很常见的痛点。
8. **斜杠命令**（至少 `/compact`、`/new`）与 **`@` 提及**（先做 topics/agents/files 三类即可）。

### P2 —— 大工程 / 低优先（按需）
9. 虚拟列表（长会话）；10. 浮动页头 + 话题操作菜单（把改名/删除/导出从侧栏提到页头）；11. 专用错误卡；12. 引用来源卡；13. 历史分页 / 迷你地图 / 滚动位置恢复；14. 多选转发 / 语音。

### 明确"不做"或"已足够"
- 权限体系（viewer/editor）、多选转发、语音、IDE/终端面板、工作目录/git —— 家用场景不需要。
- 用户气泡/助手扁平、推理折叠、工具卡、悬停动作、三态、移动端抽屉 —— **已对齐**，别动。

---

## 9. 关键参考文件（LobeHub，按需再读）
- 滚动/虚拟化：`src/features/Conversation/ChatList/index.tsx`、`ChatList/components/VirtualizedList.tsx`、`ChatList/hooks/useConversationScroll.ts`
- 消息：`src/features/Conversation/Messages/index.tsx`、`ChatItem/ChatItem.tsx`、`AssistantGroup/components/{WorkflowCollapse,ProcessFold}.tsx`
- 动作栏：`src/features/Conversation/Messages/components/MessageActionBar/{index,useBuildActions}.ts`、`Contexts/MessageActionProvider.tsx`
- 输入区：`src/features/ChatInput/Desktop/index.tsx`、`ActionBar/config.ts`
- 空态：`src/features/AgentHome/index.tsx`
