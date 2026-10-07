---
name: image-generation
description: 'Use for the image generation feature: generate button in chat, image API call, and image bubbles in messages. Blueprint L2-10 (用户已勾选), roadmap phase 5.'
---

# AI 生成图片（L2-10）

对话中"生成图片"按钮 → 调图像生成 API → 图片以气泡进入会话。

## 参考点（学思路，不抄代码）

- `refs/lobe-chat/packages/builtin-tool-image-generation/` —— 工具结构思想
- `refs/lobe-chat/.agents/skills/builtin-tool/SKILL.md` —— "一个工具 = 元数据 + 执行 + UI"的五面结构（我们简化为：按钮 + API 调用 + 渲染）
- `refs/lobe-chat/.agents/skills/ux/SKILL.md` —— 慢操作的进行中反馈规范

## 简化版做法

1. 输入框旁"生成图片"按钮（或在聊天里发指令）。
2. `app/api/images/route.ts`：调图像 API（OpenAI images 或 fal，按已选 provider 的能力定）。
3. 图片消息类型：messages 表 content 存 URL；渲染时按类型分流为图片气泡。
4. 生成中：占位 + 进度提示；失败：可读错误。

## 注意

- 图片文件存本地 `uploads/` 或对象存储 URL，DB 只存路径。
- 生成是慢操作：考虑异步 + 轮询，按所选 API 的实际形态定。
- 失败路径必须可读：额度不足、审核拦截等错误要映射成人话。

## 验收（`docs/replica/04` 阶段 5）

- [ ] 点击生成 → 得到图片 → 图片出现在会话里
- [ ] 刷新后图片仍在（URL 持久化）
- [ ] 失败时有可读提示
