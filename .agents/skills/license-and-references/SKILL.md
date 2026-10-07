---
name: license-and-references
description: 'Use before copying anything from refs/lobe-chat, when adding dependencies, or when unsure about license boundaries. Legal reference usage for this replica project.'
---

# 参考资料与许可证

## 三句话结论

1. **学设计、自己写代码** ✅ 完全合法（代码 100% 是你的，含商用）。
2. **装 MIT 包**（`@lobehub/ui` / `@lobehub/icons` / `@lobehub/editor`）✅ 直接用。
3. **改 LobeHub 源码再对外发行** ⚠️ 需商业授权（LobeHub Community License = Apache-2.0 + 附加条款 1b）。

## 红线

- ❌ 禁止把 `refs/lobe-chat/` 的文件整段复制进本项目（尤其"改得面目全非后发布"= 衍生作品）。
- ❌ 禁止 import / 构建时引用 `refs/` 下任何内容。
- ✅ 允许读它的：数据结构设计、交互流程、目录组织、状态划分——然后**用自己的代码重写**。
- 几十行的通用工具函数"业界通常认为无版权意义"，但**能重写就重写**，别赌边界。

## 给 AI 的标准说法

> "参考 refs/lobe-chat/src/features/AgentBuilder 的字段设计和交互，用我们自己的方式实现。"

而不是："把 refs/lobe-chat 的 xxx 文件抄过来。"

## 商标

- "LobeHub" 名字与 LOGO 是商标：产品用自己的名字；可以说"设计参考了 LobeHub"。
- lobe-icons 里的品牌 LOGO（OpenAI/Anthropic/…）商标归各自厂商：自用无妨，面向大众时加"仅供参考"或用自绘图标。

## README 合规声明（项目初始化时写上）

> 本项目为独立实现，设计参考了 LobeHub（LobeHub Community License）；使用 MIT 协议的 @lobehub/ui 与 @lobehub/icons。

## 依赖纪律

- 只加 `docs/replica/03` §4 清单里的包；新依赖先问用户。
- 加依赖时确认许可证：MIT/Apache-2.0 可直接用；其他许可证先查 `docs/replica/05` 再决定。
