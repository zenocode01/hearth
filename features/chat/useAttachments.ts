'use client';

import { useCallback, useRef, useState } from 'react';

import {
  isLegacyOffice,
  isOfficeOrPdf,
  isTextFile,
  MAX_FILES_PER_MESSAGE,
  MAX_FILE_BYTES,
  MAX_OFFICE_FILE_BYTES,
  MAX_TEXT_FILE_BYTES,
} from '@/lib/files/constants';

import { prepareImageForUpload } from './imageCompress';

/**
 * 输入框附件：选文件 / 拖拽 / 粘贴 → 上传到 `/api/files` → 拿到 `/uploads/<hash>.<ext>`
 * 后随消息一起发（消息里只存 URL，DB 不进二进制）。
 *
 * 状态机（抄 LobeChat 的 `FileUploadStatus`，我们只留真正用得上的三态）：
 * `uploading`（带进度 + 本地即时预览）→ `done`（有 url）/ `error`（带原因，可重试）。
 * 上传中的附件会**立刻出现在输入框上方**（本地 blob 预览），而不是等传完才出现——
 * 否则大文件拖进去会有几百毫秒"什么都没有"的空窗。
 */
export type AttachmentStatus = 'uploading' | 'done' | 'error';

export interface Attachment {
  /** 失败原因（status === 'error'） */
  error?: string;
  /** 原始 File（重试要靠它；从消息"放回输入框"来的附件没有） */
  file?: File;
  filename: string;
  /** 稳定 id：上传中→完成→失败全程不变（React key / 定位更新都用它） */
  id: string;
  /** 上传中的本地预览（blob:），上传成功后换成服务器 url */
  localUrl?: string;
  mediaType: string;
  /** 0~100，仅 uploading 时有意义 */
  progress: number;
  size: number;
  status: AttachmentStatus;
  url?: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

/** 用 XHR 而不是 fetch：只有 XHR 能上报上传进度。 */
function postWithProgress(
  body: unknown,
  onProgress: (percent: number) => void,
): Promise<{ error?: string; file?: { filename: string; mediaType: string; size: number; url: string } }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/files');
    request.setRequestHeader('content-type', 'application/json');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('网络错误'));
    request.onload = () => {
      try {
        resolve(JSON.parse(request.responseText || '{}'));
      } catch {
        reject(new Error('返回内容无法解析'));
      }
    };
    request.send(JSON.stringify(body));
  });
}

export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef(0);
  /** 每个附件一个本地 id：File 对象不能当 key（也不能当依赖） */
  const seqRef = useRef(0);
  const localUrlsRef = useRef<Set<string>>(new Set());

  /** 上传中的附件数（发送按钮要据此禁用，抄 LobeChat 的 isUploadingFiles） */
  const uploadingCount = items.filter((item) => item.status === 'uploading').length;

  const patch = useCallback((id: string, next: Partial<Attachment>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const revokeLocal = useCallback((url?: string) => {
    if (!url || !localUrlsRef.current.has(url)) return;
    localUrlsRef.current.delete(url);
    URL.revokeObjectURL(url);
  }, []);

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => {
        const hit = prev.find((item) => item.id === id);
        if (hit?.localUrl) revokeLocal(hit.localUrl);
        const next = prev.filter((item) => item.id !== id);
        countRef.current = next.length;
        return next;
      });
    },
    [revokeLocal],
  );

  const clear = useCallback(() => {
    for (const url of localUrlsRef.current) URL.revokeObjectURL(url);
    localUrlsRef.current.clear();
    countRef.current = 0;
    setItems([]);
    setError(null);
  }, []);

  /** 上传一个已经在列表里的条目（初次 addFiles 与"重试"共用） */
  const uploadOne = useCallback(
    async (id: string, file: File) => {
      patch(id, { error: undefined, progress: 0, status: 'uploading' });
      try {
        const isImage = file.type.startsWith('image/');
        let dataBase64: string;
        let filename = file.name;
        let mediaType = file.type || 'application/octet-stream';
        let size = file.size;

        if (isImage) {
          const prepared = await prepareImageForUpload(file);
          dataBase64 = prepared.dataBase64;
          filename = prepared.filename;
          mediaType = prepared.mediaType;
          size = prepared.size;
        } else {
          dataBase64 = await readAsDataUrl(file);
        }

        const limit = isImage
          ? MAX_FILE_BYTES
          : isTextFile({ filename, mediaType })
            ? MAX_TEXT_FILE_BYTES
            : MAX_OFFICE_FILE_BYTES;
        if (size > limit) {
          patch(id, {
            error: `${filename} 太大（上限 ${Math.round(limit / 1024 / 1024)}MB）`,
            status: 'error',
          });
          return;
        }

        const data = await postWithProgress({ dataBase64, filename, mediaType }, (percent) =>
          patch(id, { progress: percent }),
        );
        if (!data?.file) {
          patch(id, { error: data?.error ?? `${filename} 上传失败`, status: 'error' });
          return;
        }
        const uploaded = data.file;
        // 上传成功：本地 blob 预览换成服务器 URL（顺便回收 blob）
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== id) return item;
            revokeLocal(item.localUrl);
            const done: Attachment = {
              filename: uploaded.filename,
              id,
              mediaType: uploaded.mediaType,
              progress: 100,
              size: uploaded.size,
              status: 'done',
              url: uploaded.url,
            };
            return done;
          }),
        );
      } catch (e) {
        patch(id, {
          error: e instanceof Error ? e.message : `${file.name} 上传失败`,
          status: 'error',
        });
      }
    },
    [patch, revokeLocal],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files];
      if (list.length === 0) return;
      setError(null);

      const drafts: Attachment[] = [];
      for (const file of list) {
        if (countRef.current + drafts.length >= MAX_FILES_PER_MESSAGE) {
          setError(`一次最多 ${MAX_FILES_PER_MESSAGE} 个附件`);
          break;
        }
        const isImage = file.type.startsWith('image/');
        if (
          !isImage &&
          !isTextFile({ filename: file.name, mediaType: file.type }) &&
          !isOfficeOrPdf({ filename: file.name, mediaType: file.type })
        ) {
          setError(
            isLegacyOffice({ filename: file.name, mediaType: file.type })
              ? `${file.name}：旧版 Office（.doc/.xls/.ppt）读不了，请另存为 .docx/.xlsx/.pptx 或 PDF`
              : `${file.name}：暂不支持这种文件（支持图片 / 文本 / docx / xlsx / pptx / pdf）`,
          );
          continue;
        }

        // 立刻上屏：图片用 blob 预览（还没传完就能看到），其它先显示文件名
        seqRef.current += 1;
        const id = `att-${seqRef.current}`;
        const isImageFile = isImage;
        if (isImageFile) {
          const blobUrl = URL.createObjectURL(file);
          localUrlsRef.current.add(blobUrl);
          drafts.push({
            file,
            filename: file.name,
            id,
            localUrl: blobUrl,
            mediaType: file.type,
            progress: 0,
            size: file.size,
            status: 'uploading',
          });
          continue;
        }
        drafts.push({
          file,
          filename: file.name,
          id,
          mediaType: file.type,
          progress: 0,
          size: file.size,
          status: 'uploading',
        });
      }

      if (drafts.length === 0) return;
      setItems((prev) => {
        const merged = [...prev];
        for (const draft of drafts) {
          if (!merged.some((old) => old.url && old.url === draft.url)) merged.push(draft);
        }
        countRef.current = merged.length;
        return merged;
      });

      // 并发上传（最多 3 个同时，避免大文件互相抢带宽）
      const queue = [...drafts];
      const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length > 0) {
          const draft = queue.shift();
          if (draft?.file) await uploadOne(draft.id, draft.file);
        }
      });
      await Promise.all(workers);
    },
    [uploadOne],
  );

  /** 重试：条目上要留着 File */
  const retry = useCallback(
    (id: string) => {
      setItems((prev) => {
        const hit = prev.find((item) => item.id === id);
        if (hit?.file) void uploadOne(id, hit.file);
        return prev;
      });
    },
    [uploadOne],
  );

  /**
   * 直接放入"已经在服务器上的附件"（消息的"放回输入框"用）：
   * URL 直接复用，不重传（对应 LobeChat 的 skipRemoveFile 思路）。
   */
  const addExisting = useCallback((incoming: Array<{ filename: string; mediaType: string; size?: number; url: string }>) => {
    if (incoming.length === 0) return;
    setItems((prev) => {
      const merged = [...prev];
      for (const item of incoming) {
        if (merged.some((old) => old.url === item.url)) continue;
        seqRef.current += 1;
        merged.push({
          filename: item.filename,
          id: `att-${seqRef.current}`,
          mediaType: item.mediaType,
          progress: 100,
          size: item.size ?? 0,
          status: 'done',
          url: item.url,
        });
      }
      countRef.current = merged.length;
      return merged;
    });
  }, []);

  return { addExisting, addFiles, clear, error, items, remove, retry, uploadingCount };
}
