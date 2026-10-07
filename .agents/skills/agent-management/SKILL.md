---
name: agent-management
description: 'Use for the agents table, Agent Builder form, agent list, and per-agent persona/model/temperature. Blueprint L1-3, roadmap phase 3.'
---

# Agent 管理（L1-3）

多个"AI 员工"：名字 / 头像 / 人设（系统提示词）/ 模型 / 温度，各自独立。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/src/features/AgentBuilder/` —— 字段与交互
- `refs/lobe-chat/.agents/skills/zustand/SKILL.md` —— 域 store 划分思想（我们起步用组件状态/SWR，量大再拆）
- `refs/lobe-chat/.agents/skills/modal/SKILL.md` —— 表单弹窗的函数式组织思想
- `refs/lobe-chat/.agents/skills/ux/SKILL.md` —— 表单三态与反馈规范

## 简化版做法

1. `agents` 表：id / name / avatar / systemPrompt / modelName / temperature / createdAt。
2. `app/agents/`：列表页 + 新建/编辑页（表单：名称、头像、系统提示词多行文本、模型下拉、温度滑杆、"测试"按钮）。
3. 聊天页顶部加 Agent 选择器；发送时把所选 Agent 的 systemPrompt 拼进请求（见 `chat-streaming`）。
4. "测试"按钮：发一句固定问题，验证人设生效。

## 注意

- systemPrompt 是大文本字段，不要提前拆成复杂结构——等真正有编辑需求再说。
- 头像：本地文件或 emoji 起步，不接对象存储。
- 换 Agent 立即生效；不要缓存旧 Agent 的设定。

## 验收（`docs/replica/04` 阶段 3）

- [ ] 建"资深后端"和"段子手"，各问同一个问题，回答风格明显不同
- [ ] 改完人设立刻生效
- [ ] 头像能换
