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

## 必须知道的六个坑

1. **服务端代码不能被客户端 import**：`lib/files/uploads.ts` 带 `node:fs`/`node:crypto`，
   客户端组件 import 它 → webpack `UnhandledSchemeError: Reading from "node:fs"` → **整页白屏**。
   常量（类型白名单、体积上限、`accept` 串）放 `lib/files/constants.ts`（纯常量，客户端安全）。
2. **`convertToModelMessages` 会 `new URL(part.url)`**：`/uploads/x.png` 是相对路径 → `TypeError: Invalid URL`。
   所以**一律先把 file 片段摘掉**再交给 SDK，图片自己转成模型 part 拼回去（`toModelMessagesWithImages`）。
3. **别用 `image` part**：AI SDK v7 已废弃（`AISDK_DEP_IMAGE_CONTENT_PART` 警告）。
   用 `{ type:'file', mediaType:'image/png', filename, data:{ type:'data', data: Buffer } }`；
   provider（`@ai-sdk/openai-compatible`）按 mediaType 分流成 `image_url`。
   ⚠️ 两个 data 形态要分清：
   - `type:'data'`（传字节）→ 正常；
   - `type:'url'` → SDK 会去**下载**那个 URL，data URL 直接 `AI_DownloadError`（2026-10-09 踩过）。
4. **文本类附件要转成文本段**（不是 file part）：provider 遇到 `data.type === 'text'` 的 file part
   会直接抛 `UnsupportedFunctionalityError`。所以 `currentTurnTextBlocks()` 把内容包成
   `<file name="x.md">…</file>` 拼进最后一条 user 消息（内置模型）或并进 prompt（CLI/pi）。
5. **用户消息也要落 parts**：路由里原本只存 `content`，附件刷新即丢。现在 user 消息也写 `parts`；
   历史加载对所有角色都用 `deserializeParts` 还原，所以图片刷新后照常显示。
6. **浏览器给的代码文件 mime 不可靠**（.ts 可能被报成 `video/mp2t`）→ 判定要**扩展名兜底**
   （`isTextFile()` 看 mime 或扩展名），存盘扩展名也优先用原文件名。

## 两条可靠性契约（抄 LobeChat，2026-10-09）

这两条不是 UI 细节，是**防止一个附件毁掉一个会话**：

### 1. 超长正文 → 预览 + 明确声明（`buildFileBody`）

- `FILE_INLINE_MAX_CHARS = 50_000`：超过就**只给前 `FILE_PREVIEW_CHARS = 4_000` 字**，
  并在后面写明：这是预览、完整约 N 字、此处没有工具能读剩余部分，请基于预览回答并在依赖省略部分时提醒用户。
- 关键是**读全量再判断**（`MAX_TEXT_CHARS_PER_FILE` 是读的上限，不是内联上限）——
  这样提示里的 N 字是真实全文长度，模型能据此知道自己漏了什么。
- 实测：19 万字文件问末尾结论 → 模型答「我只能看到前 4000 字预览，剩余读不到，拒绝编造，
  请把结尾贴给我」，还主动提议用网页抓取工具。
- 上传上限因此放宽到 1MB（`MAX_TEXT_FILE_BYTES`）：卡太死只会让用户频繁失败，
  反正进模型的最多 50k 字。

### 2. 不支持视觉 → 显式占位符，不静默丢图

`LLM_VISION=0`（`lib/llm/capabilities.ts`）时，图片 part 换成一段文本：
「用户发送了 N 张图片（名字），但当前模型不支持视觉，看不到内容，请直接告知对方…」。
静默丢图会让模型一脸茫然，还会让用户以为图已经送达。

顺带：`.env.example` 里已写好 `LLM_VISION`，换纯文本模型时改这一个开关即可
（不需要 LobeChat 那套 model-bank 能力标注）。

- **只有当前轮的图片进模型**（历史里的附件只留文字）：每轮重发要把文件读成 base64，
  图片 token 也会让本地模型上下文迅速膨胀。想看旧图需要用户重发（LobeHub 是整段历史都带）。
- **按内容哈希命名 + 覆盖写**：同一张图重复上传只占一份，`public/uploads` 天然去重；
  中文/空格不参与 URL（原名存消息片段）。
- **落 `public/uploads` 而不是 DB**：符合 image-generation skill 的约定（DB 只存路径）；
  代价是没有清理机制（自己按需加）。

## 限制常量（都在 `lib/files/constants.ts`）

- 图片 4 种 mime；单文件 5MB
- **文本类**：`TEXT_MEDIA_TYPES` + `TEXT_EXTENSIONS`（含代码文件扩展名），单独 256KB 上限，
  进 prompt 时每文件最多 20k 字符（超出截断并标注）
- 单条消息 6 个附件；`FILE_ACCEPT` 是给 `<input accept>` 用的串
扩展格式时**只改 constants.ts + uploads.ts 的校验/扩展名映射**，前端会自动跟随。
C 期（Office/PDF）要在这里加类型白名单，并在 `attachments.ts` 里把"抽文本"接到
`currentTurnTextBlocks` 那条路上。

## Office / PDF（C 期）

- `.docx/.xlsx/.pptx` = zip + XML：`fflate` 解包后自己抽文本（`lib/files/office.ts`）
  - docx：`</w:p>`→换行、`<w:tab/>`→制表符，再去标签 + 解实体
  - pptx：`<a:t>` 取文字，按 `slideN` 排序，每页一段
  - xlsx：`sharedStrings.xml` + `sheetN.xml`，按单元格引用（A1→列号）排序，制表符分隔
  - 够用优先：不还原格式/公式/日期
- `.pdf`：`pdfjs-dist` 的 legacy build 抽文字层
  - ⚠️ `standardFontDataUrl` 必须是**正斜杠 + 结尾斜杠**（`path.join` 会吃掉结尾斜杠 → "Invalid factory url"）
  - **扫描件没有文字层** → 抽出来是空，UI 会显示"无法提取文本"
- **旧版 `.doc/.xls/.ppt`（OLE 二进制）不做**：纯 JS 抽不出，本机也没有 LibreOffice/antiword
  → 上传时就 415 拒绝，并提示"请另存为 .docx/.xlsx/.pptx 或 PDF"
- 抽文本统一接在 `currentTurnTextBlocks()`（和纯文本附件同一条路）

自测技巧（不想每次都过 UI）：`npx esbuild lib/files/office.ts --bundle --platform=node
--format=esm --outfile=<tmp>.mjs --external:pdfjs-dist --external:fflate --external:node:*`
之后在 node 里用 fflate 造 zip 样本 / 手搓最小 PDF 直接断言抽取结果。

## pi（CLI）路径怎么传图

pi 的 RPC `prompt` 命令支持 `images: [{ type:'image', mimeType, data:<base64> }]`
（`dist/modes/rpc/rpc-mode.js` 的 `case 'prompt'` → `session.prompt(msg, { images })`；
`ImageContent.data` 是 **base64 字符串**，不是 Uint8Array）。
用 `currentTurnImages(messages)`（`lib/llm/attachments.ts`）把当前轮附件转成 base64 即可。
