'use client';

import { AlertTriangle, Loader2, RotateCw, X } from 'lucide-react';
import { memo, useState } from 'react';

/** 预览条目：输入框里的（有 status/progress）与消息里的（只读）都能用 */
export interface PreviewItem {
  error?: string;
  filename: string;
  id?: string;
  /** 上传中的本地 blob 预览 */
  localUrl?: string;
  mediaType: string;
  progress?: number;
  size?: number;
  status?: 'uploading' | 'done' | 'error';
  url?: string;
}

interface AttachmentPreviewProps {
  /** 传入时显示删除按钮（输入框上的待发送附件）；不传就是只读展示（消息里的） */
  onRemove?: (id: string) => void;
  /** 传入时失败条目显示"重试" */
  onRetry?: (id: string) => void;
  items: PreviewItem[];
  /** 缩略图边长 */
  size?: number;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 附件预览：输入框上方（待发送：进度/失败重试/删除）+ 消息里（只读、可点开大图）。
 * 点图打开灯箱（自己写的简易遮罩，不引组件库的预览 API，省一个依赖面）。
 */
export const AttachmentPreview = memo(
  ({ items, onRemove, onRetry, size = 64 }: AttachmentPreviewProps) => {
    const [preview, setPreview] = useState<string | null>(null);
    if (items.length === 0) return null;

    const keyOf = (item: PreviewItem) => item.id ?? item.url ?? item.filename;

    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 2px 4px' }}>
          {items.map((item) => {
            const isImage = item.mediaType.startsWith('image/');
            const src = item.url ?? item.localUrl;
            const uploading = item.status === 'uploading';
            const failed = item.status === 'error';
            const border = failed
              ? '1px solid var(--ant-color-error, #ff4d4f)'
              : '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))';

            return (
              <div
                key={keyOf(item)}
                style={{
                  alignItems: 'center',
                  background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.04))',
                  border,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: isImage ? 4 : '4px 8px',
                  position: 'relative',
                }}
                title={item.filename}
              >
                <div style={{ position: 'relative' }}>
                  {isImage && src ? (
                    <img
                      alt={item.filename}
                      onClick={() => !uploading && setPreview(src)}
                      src={src}
                      style={{
                        borderRadius: 4,
                        cursor: uploading ? 'progress' : 'zoom-in',
                        display: 'block',
                        height: size,
                        objectFit: 'cover',
                        width: size,
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.filename}
                    </span>
                  )}

                  {/* 上传中：半透明遮罩 + 百分比（抄 LobeChat 的进度环文案思路） */}
                  {uploading && (
                    <div
                      style={{
                        alignItems: 'center',
                        background: 'rgba(0,0,0,0.45)',
                        borderRadius: 4,
                        bottom: 0,
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        fontSize: 11,
                        gap: 2,
                        justifyContent: 'center',
                        left: 0,
                        position: 'absolute',
                        right: 0,
                        top: 0,
                      }}
                    >
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      {formatSize(item.size ?? 0)} · {item.progress ?? 0}%
                    </div>
                  )}
                  {failed && (
                    <div
                      style={{
                        alignItems: 'center',
                        background: 'rgba(255,77,79,0.9)',
                        borderRadius: 4,
                        bottom: 0,
                        color: '#fff',
                        display: 'flex',
                        justifyContent: 'center',
                        left: 0,
                        position: 'absolute',
                        right: 0,
                        top: 0,
                      }}
                    >
                      <AlertTriangle size={14} />
                    </div>
                  )}
                </div>

                {/* 体积/状态说明：图片缩略图本身已经很明显了，只给非图片显示文件名与体积 */}
                {!isImage && (
                  <span style={{ fontSize: 10.5, opacity: 0.6 }}>
                    {failed ? '上传失败' : formatSize(item.size ?? 0)}
                  </span>
                )}
                {failed && item.error && (
                  <span style={{ color: 'var(--ant-color-error, #ff4d4f)', fontSize: 10.5, maxWidth: 160 }}>
                    {item.error.slice(0, 40)}
                  </span>
                )}

                {/* 重试（只在上传失败时出现） */}
                {failed && onRetry && (
                  <button
                    onClick={() => onRetry(keyOf(item))}
                    style={{
                      alignItems: 'center',
                      background: 'var(--ant-color-bg-container, #fff)',
                      border: '1px solid var(--ant-color-border, rgba(0,0,0,0.12))',
                      borderRadius: '50%',
                      bottom: -6,
                      cursor: 'pointer',
                      display: 'flex',
                      height: 18,
                      justifyContent: 'center',
                      padding: 0,
                      position: 'absolute',
                      right: -6,
                      width: 18,
                    }}
                    title="重试上传"
                    type="button"
                  >
                    <RotateCw size={10} />
                  </button>
                )}

                {/* 删除（失败条目也能删——不能只让用户一直重试） */}
                {onRemove && (
                  <button
                    aria-label={`移除 ${item.filename}`}
                    onClick={() => onRemove(keyOf(item))}
                    style={{
                      alignItems: 'center',
                      background: 'var(--ant-color-bg-container, #fff)',
                      border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.12))',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      height: 18,
                      justifyContent: 'center',
                      padding: 0,
                      position: 'absolute',
                      right: -6,
                      top: -6,
                      width: 18,
                    }}
                    title="移除"
                    type="button"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
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
            <img alt="预览" src={preview} style={{ maxHeight: '88vh', maxWidth: '92vw', objectFit: 'contain' }} />
          </div>
        )}
      </>
    );
  },
);

AttachmentPreview.displayName = 'AttachmentPreview';
