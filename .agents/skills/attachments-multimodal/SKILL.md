---
name: attachments-multimodal
description: 附件与多模态输入相关（图片附件/上传/public/uploads/file 片段/图片发给模型/pi 传图）。做"给 AI 发图片、传文件、附件预览与渲染、附件落库"这类需求前先读。
---

# 附件 / 多模态输入

Hearth 的附件链路（2026-10-08 起，A 期=图片，B 期=文本，C 期=Office/PDF）。

## 数据流（照着这条链改，别跳步）

```
浏览器 File
  → FileReader 读成 data URL（useAttachments）
  → POST /api/files  { dataBase64, filename, mediaType }     app/api/files/route.ts
  → lib/files/uploads.ts：校验类型/体积 → sha1 命名 → 写 public/uploads/<hash>.<ext>
  ← { file: { url: '/uploads/<hash>.png', filename, mediaType, size } }
  → 输入框预览（AttachmentPreview，可删）
  → sendMessage({ text, files: [{ type:'file', mediaType, filename, url }] })
  → 消息里落 file 片段（**只存 URL**，DB 不进二进制）
  → 发模型前：lib/llm/attachments.ts 把 file 片段转成模型 file part（见下）
  → 渲染：MessageItem 里 AttachmentPreview（缩略图 + 自写灯箱）
```

## 必须知道的四个坑

1. **服务端代码不能被客户端 import**：`lib/files/uploads.ts` 带 `node:fs`/`node:crypto`，
   客户端组件 import 它 → webpack `UnhandledSchemeError: Reading from "node:fs"` → **整页白屏**。
   常量（类型白名单、体积上限、`accept` 串）放 `lib/files/constants.ts`（纯常量，客户端安全）。
2. **`convertToModelMessages` 会 `new URL(part.url)`**：`/uploads/x.png` 是相对路径 → `TypeError: Invalid URL`。
   所以**一律先把 file 片段摘掉**再交给 SDK，图片自己转成模型 part 拼回去（`toModelMessagesWithImages`）。
3. **别用 `image` part**：AI SDK v7 已废弃（`AISDK_DEP_IMAGE_CONTENT_PART` 警告）。
   用 `{ type:'file', mediaType:'image/png', filename, data:{ type:'url', url: dataUrl } }`；
   provider（`@ai-sdk/openai-compatible`）按 mediaType 分流成 `image_url`。
   ⚠️ 但 `data.type === 'text'` 的 file part 会被 provider 直接抛错 → 文本类附件（B 期）要转成**文本段**。
4. **用户消息也要落 parts**：路由里原本只存 `content`，附件刷新即丢。现在 user 消息也写 `parts`；
   历史加载对所有角色都用 `deserializeParts` 还原，所以图片刷新后照常显示。

## 有意的取舍

- **只有当前轮的图片进模型**（历史里的附件只留文字）：每轮重发要把文件读成 base64，
  图片 token 也会让本地模型上下文迅速膨胀。想看旧图需要用户重发（LobeHub 是整段历史都带）。
- **按内容哈希命名 + 覆盖写**：同一张图重复上传只占一份，`public/uploads` 天然去重；
  中文/空格不参与 URL（原名存消息片段）。
- **落 `public/uploads` 而不是 DB**：符合 image-generation skill 的约定（DB 只存路径）；
  代价是没有清理机制（自己按需加）。

## 限制常量（A 期：只放行图片）

`lib/files/constants.ts`：图片 4 种 mime、单文件 5MB、单条消息 6 个附件。
扩展格式时**只改这里 + `uploads.ts` 的校验/扩展名映射 + `IMAGE_ACCEPT`**，前端会自动跟随。

## pi（CLI）路径怎么传图

pi 的 RPC `prompt` 命令支持 `images: [{ type:'image', mimeType, data:<base64> }]`
（`dist/modes/rpc/rpc-mode.js` 的 `case 'prompt'` → `session.prompt(msg, { images })`；
`ImageContent.data` 是 **base64 字符串**，不是 Uint8Array）。
用 `currentTurnImages(messages)`（`lib/llm/attachments.ts`）把当前轮附件转成 base64 即可。
