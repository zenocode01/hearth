---
name: ui-theming
description: 'Use for theming with @lobehub/ui tokens, dark/light mode, antd-style basics, and the empty/loading/error three states. Blueprint L2-7, roadmap phase 4.'
---

# 主题系统（L2-7）

直接用 `@lobehub/ui`（MIT）的主题 token 体系——深浅色切换是现成的。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/DESIGN.md` —— token 定义（颜色/字体/间距/圆角）与 Voice 文案规范
- `refs/lobe-chat/.agents/skills/ux/SKILL.md` —— 交互行为规范（空/加载/错误三态等）
- `refs/lobe-chat/.agents/skills/react/SKILL.md` —— 组件选择与样式纪律
- `refs/lobe-chat/.agents/skills/design-prototype/SKILL.md` —— 原型验证思想

## 简化版做法

1. 主题切换：用 `@lobehub/ui` 的 ConfigProvider / ThemeProvider（dark / light / 跟随系统）。
2. 主色：如需可选，用 token 覆盖，不手写 CSS 变量。
3. 样式优先 `createStaticStyles`（零运行时）；组件优先 `@lobehub/ui` 现成的，不手搓 antd 基础组件。
4. 文案语气参考 DESIGN.md 的 Voice（自然 / 意义感 / 确定性 / 成长）。

## 本项目主题架构（阶段 0 已落地）

文件：`components/AppThemeRoot.tsx`（客户端壳）、`components/AppThemeProvider.tsx`（装配 + 切换动画）、`components/theme.ts`（常量）、`app/layout.tsx`（服务端读 cookie）、`app/globals.css`（首屏兜底 + View Transitions 样式）。

- **初始主题走 cookie**：`app/layout.tsx` 服务端读 `pi-theme` cookie 并渲染到 `<html data-theme>`。服务端与首帧一致 → 无水合错配、无白闪。（因此 `/` 是动态渲染，正常。）
- **主题壳客户端渲染**：`AppThemeRoot` 用 `dynamic(..., { ssr: false })`。原因：antd-style/emotion 在 Next App Router 下服务端与客户端样式注入不一致，直接 SSR 会 "Hydration failed"。首屏底色由 `globals.css` + `<html data-theme>` 兜底。
- **切换动画可配置**：右下角"主题坞"（`ThemeSwitcher`）除模式外，还有"切换动画"选项：`fade`（整页交叉淡入）/ `circle`（从点击位置圆形扩散）/ `none`（瞬时）。逻辑在 `components/themeTransition.ts`：`runThemeTransition(update, effect)` 用 `document.startViewTransition(() => flushSync(update))`，`fade` 用 `::view-transition-old/new(root)` 的 `opacity`，`circle` 用 `::view-transition-new(root)` 的 `clip-path`（圆心取最近一次 pointerdown）。不支持 View Transitions 时统一降级为"颜色过渡"；`prefers-reduced-motion` 时瞬时切换。效果偏好存 localStorage（`pi-theme-effect`，纯客户端行为）。
- **切换时务必处理 CSS transition**：body 背景是瞬切（0s）、antd 组件默认 `transition: all 0.2s`，不同步 = 错位闪烁。用 View Transitions 时给真实 DOM 注入 `transition:none!important`，窗口需覆盖 antd-style 重新生成样式的 ~100ms（当前取 `CIRCLE_DURATION_MS + 600` ms），动画交给快照。
- **自定义样式必须用 `--ant-color-*`**：`theme={{ cssVar: { key: 'pi-vars' } }}` 实际**未生效**，页面里生成的是 antd 默认前缀的 kebab-case 变量，如 `--ant-color-bg-elevated`、`--ant-color-fill-secondary`、`--ant-color-border-secondary`、`--ant-color-error`。写 `var(--pi-vars-*)` 会永远走兜底值（深色下就会"发白"）。验证方法：`getComputedStyle(el).getPropertyValue('--ant-color-bg-elevated')`。
- **主题控件不悬浮**：`ThemeControls` 是纯控件，聊天页放进顶栏（`ChatView` 的 header），只有无顶栏的页面才用悬浮坞 `ThemeDock`。状态经 `components/themeContext.ts` 共享——悬浮在内容之上一定会遮挡滚动内容。

## 三态纪律（每个页面）

- 空：列表为空时的引导态
- 加载：骨架屏，结构与真实布局一致
- 错误：可读文案 + 重试

**本项目已落地的三态实现（阶段 4）**：

- **统一封装**：`components/AsyncBoundary.tsx`——顺序是 **错误 → 加载 → 空 → 内容**。踩过：把 `empty` 传成无条件节点 → 列表永远不显示（所以它用 `isEmpty` 显式开关，别改成"给了 empty 就是空态"）。错误态带「重试」按钮（`onRetry`）。
- **骨架延迟出现**：`components/Delayed.tsx`（默认 200ms）——快响应不闪骨架，慢响应才显示（参考 refs 的 `Skeleton/Delayed`）。
- **骨架要用新 API**：`@lobehub/ui/base-ui` 的 `Skeleton / SkeletonAvatar / SkeletonText`（`<Skeleton animated height radius width />`）。旧的 `@lobehub/ui` 的 `Skeleton.Block` 已标 **deprecated**（是 antd-style 的 Block 包装）。
- **骨架形状对齐真实布局**：`components/ListSkeleton.tsx`（头像 + 两行）、`features/chat/MessageSkeleton.tsx`（用户气泡 + 助手多行）、`features/agent/AgentEditorSkeleton.tsx`（标题 + 预览卡 + 表单卡）。给骨架元素加 `data-testid`（如 `list-skeleton`），验证时好抓（LobeHub 也这么做）。
- **刷新要静默**：`refreshTopics({ silent: true })` 这种约定——发送消息/改名/删除后的刷新不闪骨架、失败也不把已有列表换成错误页；只有首次加载显示三态。
- **首屏（客户端渲染项目的白屏问题）**：页面全部在 `AppThemeRoot`（`dynamic ssr:false`）里 → SSR 输出没有页面内容。解法：`components/BootSplash.tsx` 由 layout **服务端渲染**（HTML 里就能看到"正在启动…"），`AppThemeProvider` 挂载后派发 `pi-app-ready` 事件隐藏它（React state 驱动，不手工动 DOM）；颜色直接在 globals.css 按 `data-theme` 写（那时还没有 antd 变量）。
- **路由级 loading**：`app/*/loading.tsx` 复用上面的骨架组件（同形状，避免二次闪烁）。
- **预取**：`router.prefetch()` + 按钮 `onMouseEnter` 预取；**只在生产生效**（Next 文档 prefetching.md："Automatic prefetching runs only in production"），dev 里看不到预取请求是正常的。
- **包导入优化**：`next.config.ts` 的 `experimental.optimizePackageImports: ['@lobehub/icons', '@lobehub/ui']`（lucide-react/antd 已在默认清单）。**改 next.config 会触发 dev server 自动重启**，且该优化重启后才生效。
- **验证三态的土办法**：浏览器里注入 `window.fetch` 补丁（延迟 → 看骨架；reject → 看错误态）+ **客户端导航**（`history.back/forward` 是整页加载会清掉补丁，要用页面内的按钮/链接跳转），可复现"慢网络/断网"。截图工具需要桌面窗口可见，否则改用 DOM 断言。

## 验收（`docs/replica/04` 阶段 4）

- [ ] 深浅色切换正常，无残留白块
- [ ] 每个页面都有空/加载/错误三态
- [ ] 移动端竖屏可用（响应式）

## 常见翻车

- 切换主题后局部白块 → 该处用了硬编码颜色，改用 token。
- 骨架屏跳动 → 骨架结构与真实布局不一致；对照真实渲染调整。
- 切换深浅色闪烁 → body 瞬切、组件 0.2s 渐变不同步；见上"切换时务必处理 CSS transition"。
- 控制台 "Hydration failed" → antd-style/emotion 的 SSR 注入不一致；主题壳必须 `dynamic(..., { ssr: false })`。
- 首屏白闪 → 缺 cookie 驱动的 `<html data-theme>` 或 `globals.css` 兜底底色。
