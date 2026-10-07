'use client';

import { useState } from 'react';

import { Button, Flexbox, Input, Text } from '@lobehub/ui';

/** 阶段 0 验收页：LobeHub 风格的空页面 + 深浅色切换。 */
export default function HomePage() {
  const [message, setMessage] = useState('');

  return (
    <Flexbox
      align="center"
      justify="center"
      style={{ minHeight: '100vh', padding: 24 }}
    >
      <Flexbox gap={24} style={{ width: '100%', maxWidth: 520 }}>
        <Flexbox align="center" gap={12}>
          <h1 style={{ fontSize: 48, fontWeight: 700, margin: 0 }}>pi-web</h1>
          <Text type="secondary">
            LobeHub 功能复刻版 · 家用配方（Next.js + @lobehub/ui）
          </Text>
        </Flexbox>

        <Input
          allowClear
          placeholder="输入消息…（阶段 1 接入流式聊天）"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button block disabled type="primary">
          开始聊天（阶段 1）
        </Button>

        <Text type="secondary" style={{ textAlign: 'center' }}>
          本项目为独立实现，设计参考了 LobeHub；使用 MIT 协议的 @lobehub/ui
          与 @lobehub/icons。
        </Text>
      </Flexbox>
    </Flexbox>
  );
}
