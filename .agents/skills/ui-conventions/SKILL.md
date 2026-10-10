---
name: ui-conventions
description: 'Use when building or tweaking any UI: button hierarchy, dialogs/confirmations, icon buttons, spacing/radius/typography tokens, and page/action-bar layout. Distilled from refs/lobe-chat DESIGN.md + skills (modal/ux/react).'
---

# UI 约定（按钮 / 对话框 / 排布）

本项目的视觉与交互**对齐 LobeHub**：我们用的就是同一套 `@lobehub/ui`（MIT），所以差别在执行约定，不在造轮子。
事实来源：`refs/lobe-chat/DESIGN.md`（token）、`refs/lobe-chat/.agents/skills/{modal,ux,react}/`（行为与组件纪律）。**学约定，不抄代码**。

## 组件选择顺序

1. `@lobehub/ui/base-ui`（无头/新）→ 2. `@lobehub/ui`（组合件）→ 3. 底层原语（antd/lucide）兜底。
- 骨架：`base-ui` 的 `Skeleton/SkeletonText`（旧的 `Skeleton.Block` 已 deprecated，见 `ui-theming`）。
- 反馈：`toast`、对话框 `confirmModal/createModal`、`Popover`、`DropdownMenu` 都从 `@lobehub/ui/base-ui`。

## 按钮（层级与形态）

- **一个视图里只留一个 `type="primary"`**（最重要的动作）。普通做动用默认；低强调用 `type="text"`；「新增一行/导入」类用 `type="dashed"`。
- **破坏性 = `danger`**（红色）。永远别让删除是默认样式。
- **纯图标按钮用 `ActionIcon`**（不是 `<Button icon=... />`）：`<ActionIcon icon={Pencil} title="改名" size={16} onClick={...}/>`，`title` 会进 Tooltip，`variant="borderless"` 常配 `gap={4}` 的工具栏。
- **一组动作**（消息悬浮栏、卡片工具条）用 `ActionIconGroup`（`variant="borderless"`，`items` + `onActionClick`），overflow 用 `menu`。
- 尺寸跟进 control height：`size="small" | "middle"(默认 36) | "large"(40，触控)`。

## 对话框 / 确认

- **本项目用声明式 `<Modal>`（base-ui），不用命令式 `confirmModal`**。命令式依赖全局 `<ModalHost/>`，宿主一旦没挂上就"点了删除既不弹窗也不删"（**踩过**：dev HMR 只更新了子组件、根壳没重挂 → 全站删除失效）。声明式自包含、无全局依赖。
- **统一入口**：`components/confirmDialog.tsx` 的 `useConfirmDelete()`：
  ```tsx
  const confirm = useConfirmDelete();
  <ActionIcon onClick={() => confirm.open({ title: '删除会话？', content: '…', onOk: () => del(id) })} />
  {confirm.modal}   // 挂在组件树任意位置
  ```
  破坏性用 `okButtonProps={{ danger: true }}`；Modal 默认「取消在左、确认在右」；`onOk` 返回 Promise 时按钮自动 loading。
- 文案写清「删的是什么 + 能不能恢复」。
- 高代价（批量/不可逆）可上「输入关键字才解锁」的强化确认（LobeHub 的 `DeleteLabelModal` 思路），当前场景未用。

## 间距 / 圆角 / 字号（token 纪律）

- **间距走 4px 尺度**：4 / 8 / 12 / 16 / 20 / 24 / 32。一组内 8、组间 16、区块间 24~32；卡片内边距 16~24。**6 / 10 / 13 属于 drift**，尽量回到尺度上。
- **圆角单独一套**：4（标签）/ 6（输入框）/ 8（默认：按钮、卡片）/ 12（菜单、弹层、大面）。**别拿圆角当间距**。全圆 9999 只给药丸/头像/圆形图标按钮。
- **字号只用 12 / 14 / 16**（`fontSizeSM/fontSize/fontSizeLG`）。**没有 13px**；`11.5 / 12.5` 也是漂移 → 归到 12 或 14，用 `colorText*` 的层级去拉开差别，而不是塞一个中间字号。（`grep "fontSize:"` 可见历史 drift，改到哪算哪。）
- 标题：`fontWeight 600`；正文行高 ~1.57。

## 颜色 token（别写死颜色）

- 文本用 `colorText → colorTextSecondary → colorTextTertiary → colorTextQuaternary` 排序；`@lobehub/ui` 的 `Text type` 只认 `secondary|success|warning|danger|info`——要 tertiary/quaternary 用 `color={cssVar.colorTextTertiary}`（`type="tertiary"` 会静默失效）。
- 表面：`colorBgLayout`（页）→ `colorBgContainer`（卡片）→ `colorBgElevated`（弹层）→ `colorBgSpotlight`（tooltip）。
- 边框/悬停填充是半透明的：日常分隔 `colorBorderSecondary`，强边 `colorBorder`，悬停 `colorFillTertiary`。
- **本项目实现细节**：实际生效的 CSS 变量前缀是 `--ant-color-*`（不是 `hearth-vars`），内联样式写 `var(--ant-color-*, 兜底)`，见 `ui-theming`。

## 布局 / 排布

- **页头**：一条 ~44px 的横条，`padding: 8`、`gap: 4`、两端对齐（左：返回/标题/面包屑；右：一串 `ActionIcon`，`gap: 4`）。
- **输入区（composer）**：**左侧操作 / 右侧发送**。左侧放「工具、技能、思考档、会话树、上下文」这些入口（图标/文字 chip），右侧固定发送/停止按钮；次要信息（上下文 chip 等）在窄屏可收。
- 主内容居中，宽屏让两侧留白增长；每个界面都要 light+dark、桌面+手机两套（手机不是补丁）。

## 本项目现状（做过的 / 待办）

- 已落地：主题 token（`ui-theming`）；删除统一确认对话框（`confirmDelete` + `ModalHost`）；消息动作栏 `ActionIconGroup`。
- 待办：`AgentList` / `TopicSidebar` 的图标按钮仍是 `<Button icon type="text">` → 换 `ActionIcon`；字号 drift（13/12.5/11.5）逐步归位；列表卡片边框/圆角按 token 统一。

## 验收手法

- 桌面浏览器若不可见（截图工具报 "needs a visible tab"），用 **DOM 断言**：`browser.evaluate` 读 `getBoundingClientRect()` 宽度、`getComputedStyle().whiteSpace`、弹层 `innerText` 等。改代码触发 HMR 会清掉临时插入的节点，断言之间别改文件。
