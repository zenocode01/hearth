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

## 三态纪律（每个页面）

- 空：列表为空时的引导态
- 加载：骨架屏，结构与真实布局一致
- 错误：可读文案 + 重试

## 验收（`docs/replica/04` 阶段 4）

- [ ] 深浅色切换正常，无残留白块
- [ ] 每个页面都有空/加载/错误三态
- [ ] 移动端竖屏可用（响应式）

## 常见翻车

- 切换主题后局部白块 → 该处用了硬编码颜色，改用 token。
- 骨架屏跳动 → 骨架结构与真实布局不一致；对照真实渲染调整。
