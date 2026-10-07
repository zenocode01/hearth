'use client';

import { FluentEmoji, Flexbox, Text } from '@lobehub/ui';
import { memo } from 'react';

const EXAMPLES = ['用三句话解释什么是 SSE', '写一个 TypeScript 的防抖函数', '给我一道周末散步的路线建议'];

/** 空会话引导态。 */
export const EmptyState = memo(() => (
  <Flexbox align="center" gap={8} justify="center" style={{ height: '100%' }}>
    <FluentEmoji emoji="🤯" size={56} />
    <Text style={{ fontSize: 18, fontWeight: 600 }}>开始第一次对话</Text>
    <Text type="secondary">随便问点什么，比如：</Text>
    <Flexbox gap={4}>
      {EXAMPLES.map((example) => (
        <Text key={example} type="secondary">
          · {example}
        </Text>
      ))}
    </Flexbox>
  </Flexbox>
));

EmptyState.displayName = 'EmptyState';
