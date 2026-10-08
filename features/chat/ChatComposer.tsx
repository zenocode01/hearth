'use client';

import { Button, Flexbox, TextArea } from '@lobehub/ui';
import { memo, useRef } from 'react';

import { useIsMobile } from '@/components/useMediaQuery';

interface ChatComposerProps {
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** 受控草稿（"放回输入框"会改写它） */
  value: string;
}

/** 底部输入框：Enter 发送、Shift+Enter 换行；流式中变为停止按钮。 */
export const ChatComposer = memo(({ busy, value, onChange, onSend, onStop }: ChatComposerProps) => {
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
      align="flex-end"
      gap={8}
      horizontal
      style={{
        borderTop: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
        padding: 12,
        // 手机底部安全区（home indicator / 手势条）
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}
    >
      <TextArea
        autoSize={{ maxRows: 6, minRows: 1 }}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
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
      {busy ? (
        <Button danger size={buttonSize} onClick={onStop}>
          停止
        </Button>
      ) : (
        <Button disabled={!canSend} size={buttonSize} type="primary" onClick={submit}>
          发送
        </Button>
      )}
    </Flexbox>
  );
});

ChatComposer.displayName = 'ChatComposer';
