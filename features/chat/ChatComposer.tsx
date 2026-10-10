'use client';

import { Button, Flexbox, TextArea } from '@lobehub/ui';
import { memo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { useIsMobile } from '@/components/useMediaQuery';

export interface SlashCommand {
  description?: string;
  name: string;
}

interface ChatComposerProps {
  /** 上下文占用读数 + 手动压缩（操作栏 chip；手机上不给放，位置不够） */
  contextMeter?: ReactNode;
  /** 待发送附件的预览区（挂在输入框上方） */
  attachmentSlot?: ReactNode;
  /** 附件按钮（操作栏左侧，工具入口旁边） */
  attachButton?: ReactNode;
  busy: boolean;
  /** 斜杠命令（输入 `/` 时弹出，对标 LobeHub 的 slash 命令） */
  commands?: SlashCommand[];
  /** 有待回答的提问时禁用输入（避免并发发消息；参考 refs：pending 时输入框不可用） */
  disabled?: boolean;
  /** 思考等级切换（会话级，覆盖 Agent 设置；放在操作栏工具入口旁） */
  effortPicker?: ReactNode;
  /** 会话树入口（pi 主题专用；放操作栏，桌面端给） */
  sessionTree?: ReactNode;
  onChange: (value: string) => void;
  /** 执行一个斜杠命令 */
  onCommand?: (name: string) => void;
  /** 选文件 / 拖拽 / 粘贴进来的文件 */
  onFiles?: (files: FileList | File[]) => void;
  onSend: () => void;
  onStop: () => void;
  /** 工具入口等（放在输入框下方的操作栏左侧，参考 LobeHub 的 ActionBar） */
  toolPicker?: ReactNode;
  /** 已发送过的输入历史（↑/↓ 翻，对标 LobeHub 的 InputHistoryPopup） */
  history?: string[];
  /** 受控草稿（"放回输入框"会改写它） */
  value: string;
}

/** 底部输入框：Enter 发送、Shift+Enter 换行；流式中变为停止按钮。 */
export const ChatComposer = memo(
  ({
    attachmentSlot,
    attachButton,
    busy,
    commands,
    contextMeter,
    disabled,
    value,
    onChange,
    onCommand,
    onFiles,
    onSend,
    onStop,
    effortPicker,
    sessionTree,
    toolPicker,
    history,
  }: ChatComposerProps) => {
    const composingRef = useRef(false);
    const dragDepthRef = useRef(0);
    const [dragging, setDragging] = useState(false);
    /** 输入历史浏览位置：-1 = 不在浏览（对标 LobeHub 的输入历史） */
    const [histIndex, setHistIndex] = useState(-1);
    /** 斜杠命令选中项 */
    const [slashIndex, setSlashIndex] = useState(0);
    const isMobile = useIsMobile();
    const canSend = (value.trim().length > 0 || Boolean(attachmentSlot)) && !busy;
    // 触摸设备上把主按钮做大到 40px（触控目标）
    const buttonSize = isMobile ? 'large' : 'middle';

    // 斜杠命令：输入以 `/` 开头、且还没打空格时，弹出匹配的命令
    const slashQuery = /^\/(\w*)$/.exec(value)?.[1] ?? null;
    const slashMatches =
      slashQuery === null
        ? []
        : (commands ?? []).filter((cmd) =>
            cmd.name.toLowerCase().startsWith(slashQuery.toLowerCase()),
          );
    const showSlashMenu = slashMatches.length > 0;

    const submit = () => {
      if (canSend) onSend();
    };

    const runCommand = (name: string) => {
      setSlashIndex(0);
      onChange('');
      onCommand?.(name);
    };

    /** ↑/↓ 翻输入历史（光标在开头或输入框为空时触发；对标 LobeHub 的 InputHistoryPopup） */
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // 斜杠菜单打开时：↑/↓ 选项、Esc 关闭
      if (showSlashMenu) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSlashIndex((index) => Math.min(slashMatches.length - 1, index + 1));
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSlashIndex((index) => Math.max(0, index - 1));
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onChange('');
          return;
        }
      }
      const items = history ?? [];
      if (items.length === 0) return;
      const el = event.currentTarget;
      if (event.key === 'ArrowUp' && (value === '' || el.selectionStart === 0)) {
        event.preventDefault();
        const next = histIndex < 0 ? items.length - 1 : Math.max(0, histIndex - 1);
        setHistIndex(next);
        onChange(items[next]);
      } else if (event.key === 'ArrowDown' && histIndex >= 0) {
        event.preventDefault();
        const next = histIndex + 1;
        if (next >= items.length) {
          setHistIndex(-1);
          onChange('');
        } else {
          setHistIndex(next);
          onChange(items[next]);
        }
      }
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

        <div style={{ position: 'relative' }}>
          {showSlashMenu && (
            <div
              style={{
                background: 'var(--ant-color-bg-elevated, #fff)',
                border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
                borderRadius: 8,
                bottom: '100%',
                boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                left: 0,
                marginBottom: 6,
                maxHeight: 240,
                minWidth: 240,
                overflowY: 'auto',
                padding: 4,
                position: 'absolute',
                zIndex: 10,
              }}
            >
              {slashMatches.map((cmd, index) => (
                <div
                  key={cmd.name}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runCommand(cmd.name);
                  }}
                  onMouseEnter={() => setSlashIndex(index)}
                  style={{
                    alignItems: 'baseline',
                    background:
                      index === slashIndex
                        ? 'var(--ant-color-fill-tertiary, rgba(0,0,0,0.04))'
                        : undefined,
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 8,
                    padding: '6px 8px',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500 }}>/{cmd.name}</span>
                  {cmd.description && (
                    <span
                      style={{
                        color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
                        fontSize: 12,
                      }}
                    >
                      {cmd.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <TextArea
            autoSize={{ maxRows: 6, minRows: 1 }}
            disabled={disabled}
            placeholder={
              disabled ? '请先回答上面的问题…' : '输入消息，Enter 发送，Shift+Enter 换行'
            }
            value={value}
            onChange={(event) => {
              setHistIndex(-1);
              onChange(event.target.value);
            }}
            onKeyDown={handleKeyDown}
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
              if (showSlashMenu) {
                const picked = slashMatches[Math.min(slashIndex, slashMatches.length - 1)];
                if (picked) runCommand(picked.name);
                return;
              }
              submit();
            }}
          />
        </div>

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
