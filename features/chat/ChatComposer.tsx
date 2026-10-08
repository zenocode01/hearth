'use client';

import { Button, Flexbox, TextArea } from '@lobehub/ui';
import { memo, useRef, type ReactNode } from 'react';

import { useIsMobile } from '@/components/useMediaQuery';

interface ChatComposerProps {
  busy: boolean;
  /** 有待回答的提问时禁用输入（避免并发发消息；参考 refs：pending 时输入框不可用） */
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** 工具入口等（放在输入框下方的操作栏左侧，参考 LobeHub 的 ActionBar） */
  toolPicker?: ReactNode;
  /** 受控草稿（"放回输入框"会改写它） */
  value: string;
}

/** 底部输入框：Enter 发送、Shift+Enter 换行；流式中变为停止按钮。 */
export const ChatComposer = memo(
  ({ busy, disabled, value, onChange, onSend, onStop, toolPicker }: ChatComposerProps) => {
    const composingRef = useRef(false);
    const isMobile = useIsMobile();
    const canSend = value.trim().length > 0 && !busy;
    // 触摸设备上把主按钮做大到 40px（触控目标）
    const buttonSize = isMobile ? 'large' : 'middle';

    const submit = () => {
      if (canSend) onSend();
    };

    return (
      <Flexbox
        gap={6}
        style={{
          borderTop: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
          padding: 12,
          // 手机底部安全区（home indicator / 手势条）
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
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
          onPressEnter={(event) => {
            // 输入法组合中（中文拼音）不触发发送
            if (composingRef.current || event.shiftKey) return;
            event.preventDefault();
            submit();
          }}
        />

        {/* 操作栏：左侧工具入口，右侧发送/停止 */}
        <Flexbox align="center" horizontal justify="space-between">
          <div>{toolPicker}</div>
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
