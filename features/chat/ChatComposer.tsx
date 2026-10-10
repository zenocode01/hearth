'use client';

import { Button, Flexbox, TextArea } from '@lobehub/ui';
import { memo, useRef, useState, type ReactNode } from 'react';

import { useIsMobile } from '@/components/useMediaQuery';

interface ChatComposerProps {
  /** 上下文占用读数 + 手动压缩（操作栏 chip；手机上不给放，位置不够） */
  contextMeter?: ReactNode;
  /** 待发送附件的预览区（挂在输入框上方） */
  attachmentSlot?: ReactNode;
  /** 附件按钮（操作栏左侧，工具入口旁边） */
  attachButton?: ReactNode;
  busy: boolean;
  /** 有待回答的提问时禁用输入（避免并发发消息；参考 refs：pending 时输入框不可用） */
  disabled?: boolean;
  /** 思考等级切换（会话级，覆盖 Agent 设置；放在操作栏工具入口旁） */
  effortPicker?: ReactNode;
  /** 会话树入口（pi 主题专用；放操作栏，桌面端给） */
  sessionTree?: ReactNode;
  onChange: (value: string) => void;
  /** 选文件 / 拖拽 / 粘贴进来的文件 */
  onFiles?: (files: FileList | File[]) => void;
  onSend: () => void;
  onStop: () => void;
  /** 工具入口等（放在输入框下方的操作栏左侧，参考 LobeHub 的 ActionBar） */
  toolPicker?: ReactNode;
  /** 受控草稿（"放回输入框"会改写它） */
  value: string;
}

/** 底部输入框：Enter 发送、Shift+Enter 换行；流式中变为停止按钮。 */
export const ChatComposer = memo(
  ({
    attachmentSlot,
    attachButton,
    busy,
    contextMeter,
    disabled,
    value,
    onChange,
    onFiles,
    onSend,
    onStop,
    effortPicker,
    sessionTree,
    toolPicker,
  }: ChatComposerProps) => {
    const composingRef = useRef(false);
    const dragDepthRef = useRef(0);
    const [dragging, setDragging] = useState(false);
    const isMobile = useIsMobile();
    const canSend = (value.trim().length > 0 || Boolean(attachmentSlot)) && !busy;
    // 触摸设备上把主按钮做大到 40px（触控目标）
    const buttonSize = isMobile ? 'large' : 'middle';

    const submit = () => {
      if (canSend) onSend();
    };

    return (
      <Flexbox
        gap={6}
        onDragEnter={(event) => {
          if (!onFiles) return;
          dragDepthRef.current += 1;
          setDragging(true);
          event.preventDefault();
        }}
        onDragLeave={() => {
          if (!onFiles) return;
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragging(false);
        }}
        onDragOver={(event) => {
          if (onFiles) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!onFiles) return;
          event.preventDefault();
          dragDepthRef.current = 0;
          setDragging(false);
          const files = event.dataTransfer?.files;
          if (files && files.length > 0) onFiles(files);
        }}
        style={{
          background: dragging ? 'var(--ant-color-primary-bg, rgba(22,119,255,0.06))' : undefined,
          borderTop: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
          outline: dragging ? '1px dashed var(--ant-color-primary, #1677ff)' : undefined,
          padding: 12,
          // 手机底部安全区（home indicator / 手势条）
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        {attachmentSlot}

        <TextArea
          autoSize={{ maxRows: 6, minRows: 1 }}
          disabled={disabled}
          placeholder={
            disabled ? '请先回答上面的问题…' : '输入消息，Enter 发送，Shift+Enter 换行'
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onCompositionEnd={() => (composingRef.current = false)}
          onCompositionStart={() => (composingRef.current = true)}
          onPaste={(event) => {
            if (!onFiles) return;
            const files = event.clipboardData?.files;
            if (files && files.length > 0) {
              event.preventDefault();
              onFiles(files);
            }
          }}
          onPressEnter={(event) => {
            // 输入法组合中（中文拼音）不触发发送
            if (composingRef.current || event.shiftKey) return;
            event.preventDefault();
            submit();
          }}
        />

        {/* 操作栏：左侧工具入口 + 附件，右侧发送/停止 */}
        <Flexbox align="center" horizontal justify="space-between">
          <Flexbox align="center" gap={4} horizontal>
            {attachButton}
            {effortPicker}
            {toolPicker}
            {/* 手机上操作栏已经挤满，上下文读数 / 会话树只在桌面端给 */}
            {!isMobile && sessionTree}
            {!isMobile && contextMeter}
          </Flexbox>
          {busy ? (
            <Button danger size={buttonSize} onClick={onStop}>
              停止
            </Button>
          ) : (
            <Button disabled={!canSend || disabled} size={buttonSize} type="primary" onClick={submit}>
              发送
            </Button>
          )}
        </Flexbox>
      </Flexbox>
    );
  },
);

ChatComposer.displayName = 'ChatComposer';
