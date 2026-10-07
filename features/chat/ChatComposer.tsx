'use client';

import { Button, Flexbox, TextArea } from '@lobehub/ui';
import { memo, useRef, useState } from 'react';

interface ChatComposerProps {
  /** 正在提交或接收流式回复。 */
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/** 底部输入框：Enter 发送、Shift+Enter 换行；流式中变为停止按钮。 */
export const ChatComposer = memo(({ busy, onSend, onStop }: ChatComposerProps) => {
  const [value, setValue] = useState('');
  const composingRef = useRef(false);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue('');
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
        onChange={(event) => setValue(event.target.value)}
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
        <Button disabled={!value.trim()} type="primary" onClick={submit}>
          发送
        </Button>
      )}
    </Flexbox>
  );
});

ChatComposer.displayName = 'ChatComposer';
