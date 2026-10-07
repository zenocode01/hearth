'use client';

import { Button, Flexbox, Text } from '@lobehub/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ThemeDock } from '@/components/ThemeDock';

/** 首页：入口页，进入聊天。 */
export default function HomePage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const enterChat = () => {
    setLeaving(true);
    router.push('/chat');
  };

  return (
    <Flexbox align="center" justify="center" style={{ minHeight: '100dvh', padding: 24 }}>
      <Flexbox gap={24} style={{ width: '100%', maxWidth: 520 }}>
        <Flexbox align="center" gap={12}>
          <h1 style={{ fontSize: 48, fontWeight: 700, margin: 0 }}>pi-web</h1>
          <Text type="secondary">LobeHub 功能复刻版 · 家用配方（Next.js + @lobehub/ui）</Text>
        </Flexbox>

        <Button block loading={leaving} type="primary" onClick={enterChat}>
          开始聊天
        </Button>

        <Text type="secondary" style={{ textAlign: 'center' }}>
          本项目为独立实现，设计参考了 LobeHub；使用 MIT 协议的 @lobehub/ui 与 @lobehub/icons。
        </Text>
      </Flexbox>
      <ThemeDock />
    </Flexbox>
  );
}
