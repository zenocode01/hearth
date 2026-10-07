'use client';

import { Button, Flexbox, TextArea } from '@lobehub/ui';
import { memo, useRef } from 'react';

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
  const canSend = value.trim().length > 0 && !busy;

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
        <Button danger onClick={onStop}>
          停止
        </Button>
      ) : (
        <Button disabled={!canSend} type="primary" onClick={submit}>
          发送
        </Button>
      )}
    </Flexbox>
  );
});

ChatComposer.displayName = 'ChatComposer';
