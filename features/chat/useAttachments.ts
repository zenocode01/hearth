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

/** 一个已上传的附件（URL 形态，和消息里的 file 片段一致） */
export interface Attachment {
  filename: string;
  mediaType: string;
  size: number;
  url: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

/**
 * 输入框附件（A 期只做图片）：选文件 / 拖拽 / 粘贴进来的文件 → 上传到 `/api/files`
 * → 拿到 `/uploads/<hash>.png` 后挂在输入框上方预览，发送时随消息一起走。
 *
 * 上传而不是直接塞 base64：消息片段只存 URL（DB 不进二进制），刷新后照样能显示。
 */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef(0);

  const remove = useCallback((url: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.url !== url);
      countRef.current = next.length;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    countRef.current = 0;
    setItems([]);
    setError(null);
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;

    setError(null);
    setUploading(true);
    const added: Attachment[] = [];

    try {
      for (const file of list) {
        if (countRef.current + added.length >= MAX_FILES_PER_MESSAGE) {
          setError(`一次最多 ${MAX_FILES_PER_MESSAGE} 个附件`);
          break;
        }
        const isImage = file.type.startsWith('image/');
        const asText = !isImage && isTextFile({ filename: file.name, mediaType: file.type });
        const asDocument = !isImage && !asText && isOfficeOrPdf({ filename: file.name, mediaType: file.type });
        if (!isImage && !asText && !asDocument) {
          if (isLegacyOffice({ filename: file.name, mediaType: file.type })) {
            setError(`${file.name}：旧版 Office（.doc/.xls/.ppt）读不了，请另存为 .docx/.xlsx/.pptx 或 PDF`);
          } else {
            setError(`${file.name}：暂不支持这种文件（支持图片 / 文本 / docx / xlsx / pptx / pdf）`);
          }
          continue;
        }
        const limit = asText ? MAX_TEXT_FILE_BYTES : asDocument ? MAX_OFFICE_FILE_BYTES : MAX_FILE_BYTES;
        if (file.size > limit) {
          setError(`${file.name} 太大（上限 ${Math.round(limit / 1024 / 1024)}MB）`);
          continue;
        }

        try {
          const dataBase64 = await readAsDataUrl(file);
          const res = await fetch('/api/files', {
            body: JSON.stringify({
              dataBase64,
              filename: file.name,
              mediaType: file.type,
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          });
          const data = (await res.json().catch(() => null)) as {
            error?: string;
            file?: Attachment;
          } | null;
          if (!res.ok || !data?.file) {
            setError(data?.error ?? `${file.name} 上传失败`);
            continue;
          }
          added.push(data.file);
        } catch {
          setError(`${file.name} 上传失败`);
        }
      }
    } finally {
      setUploading(false);
      if (added.length > 0) {
        setItems((prev) => {
          // 同内容哈希相同 → 同一张图重复选只留一份
          const merged = [...prev];
          for (const item of added) {
            if (!merged.some((old) => old.url === item.url)) merged.push(item);
          }
          countRef.current = merged.length;
          return merged;
        });
      }
    }
  }, []);

  return { addFiles, clear, error, items, remove, uploading };
}
