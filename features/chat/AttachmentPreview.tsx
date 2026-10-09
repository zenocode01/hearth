'use client';

import { Loader2, X } from 'lucide-react';
import { memo, useState } from 'react';

import type { Attachment } from './useAttachments';

interface AttachmentPreviewProps {
  /** 传入时显示删除按钮（输入框上的待发送附件）；不传就是只读展示（消息里的） */
  onRemove?: (url: string) => void;
  items: Attachment[];
  /** 上传中（输入框场景） */
  uploading?: boolean;
  /** 缩略图边长 */
  size?: number;
}

/**
 * 附件预览：输入框上方（待发送，可删）+ 消息里（只读、可点开大图）。
 * 点图打开灯箱（自己写的简易遮罩，不引组件库的预览 API，省一个依赖面）。
 */
export const AttachmentPreview = memo(({ items, onRemove, uploading, size = 64 }: AttachmentPreviewProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  if (items.length === 0 && !uploading) return null;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 2px 4px' }}>
        {items.map((item) => {
          const isImage = item.mediaType.startsWith('image/');
          return (
            <div
              key={item.url}
              style={{
                alignItems: 'center',
                background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.04))',
                border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
                borderRadius: 8,
                display: 'flex',
                gap: 6,
                padding: isImage ? 4 : '4px 8px',
                position: 'relative',
              }}
            >
              {isImage ? (
                <img
                  alt={item.filename}
                  onClick={() => setPreview(item.url)}
                  src={item.url}
                  style={{
                    borderRadius: 4,
                    cursor: 'zoom-in',
                    display: 'block',
                    height: size,
                    objectFit: 'cover',
                    width: size,
                  }}
                  title={`${item.filename}（点击看大图）`}
                />
              ) : (
                <span style={{ fontSize: 12 }}>{item.filename}</span>
              )}
              {onRemove && (
                <button
                  aria-label={`移除 ${item.filename}`}
                  onClick={() => onRemove(item.url)}
                  style={{
                    background: 'var(--ant-color-bg-container, #fff)',
                    border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.12))',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    height: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    position: 'absolute',
                    right: -6,
                    top: -6,
                    width: 18,
                  }}
                  type="button"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
        {uploading && (
          <div style={{ alignItems: 'center', color: 'var(--ant-color-text-secondary)', display: 'flex', fontSize: 12, gap: 6 }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            上传中…
          </div>
        )}
      </div>

      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            alignItems: 'center',
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            inset: 0,
            justifyContent: 'center',
            position: 'fixed',
            zIndex: 1000,
          }}
        >
          <img
            alt="预览"
            src={preview}
            style={{ maxHeight: '88vh', maxWidth: '92vw', objectFit: 'contain' }}
          />
        </div>
      )}
    </>
  );
});

AttachmentPreview.displayName = 'AttachmentPreview';
