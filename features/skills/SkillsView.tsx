'use client';

import { Button, Flexbox, Icon, Text } from '@lobehub/ui';
import { ArrowLeft, ChevronDown, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AsyncBoundary } from '@/components/AsyncBoundary';
import { ListSkeleton } from '@/components/ListSkeleton';
import { useIsMobile } from '@/components/useMediaQuery';

interface SkillItem {
  content: string;
  description: string;
  id: string;
  name: string;
  resources: string[];
}

type LoadStatus = 'error' | 'loading' | 'ready';

/**
 * 技能页（只读）：列出本地 `data/skills/` 下的技能，展开看 SKILL.md 正文。
 * 模型侧只看到「目录」，命中后才加载正文（见 lib/skills/agent.ts）。
 */
export function SkillsView() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [dir, setDir] = useState('');
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [openId, setOpenId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const router = useRouter();

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { dir?: string; skills?: SkillItem[] };
      setSkills(data.skills ?? []);
      setDir(data.dir ?? '');
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Flexbox
      gap={16}
      style={{ margin: '0 auto', maxWidth: 880, padding: isMobile ? 16 : 24, width: '100%' }}
    >
      <Flexbox align="center" gap={8} horizontal>
        <Button
          icon={<Icon icon={ArrowLeft} size={16} />}
          size="small"
          type="text"
          onClick={() => router.push('/chat')}
        >
          返回
        </Button>
        <Text style={{ fontSize: 18, fontWeight: 600 }}>技能</Text>
      </Flexbox>

      <Text style={{ fontSize: 12, lineHeight: 1.7 }} type="secondary">
        一个技能 = 一个目录，根目录放 <code>SKILL.md</code>（frontmatter 至少含 <code>name</code>、
        <code>description</code>）。目录：<code>{dir || 'data/skills/'}</code>。
        模型平时只看得到名字与描述，相关时才加载正文。
      </Text>

      <AsyncBoundary
        error={status === 'error'}
        isEmpty={status === 'ready' && skills.length === 0}
        loading={status === 'loading'}
        skeleton={<ListSkeleton rows={3} />}
        empty={
          <Flexbox align="center" gap={8} style={{ padding: 40 }}>
            <Icon icon={Sparkles} size={28} style={{ opacity: 0.4 }} />
            <Text type="secondary">还没有技能</Text>
            <Text style={{ fontSize: 12 }} type="secondary">
              在 <code>{dir || 'data/skills/'}</code> 下建一个目录，放 <code>SKILL.md</code> 即可。
            </Text>
          </Flexbox>
        }
        onRetry={() => void load()}
      >
        <Flexbox gap={8}>
          {skills.map((skill) => {
            const open = openId === skill.id;
            return (
              <Flexbox
                gap={6}
                key={skill.id}
                style={{
                  background: 'var(--ant-color-bg-container, #fff)',
                  border: '1px solid var(--ant-color-border-secondary, rgba(0,0,0,0.08))',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Flexbox
                  align="center"
                  horizontal
                  justify="space-between"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setOpenId(open ? null : skill.id)}
                >
                  <Flexbox gap={2} style={{ minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: 600 }}>{skill.name}</Text>
                    <Text style={{ fontSize: 12 }} type="secondary">
                      {skill.description || '(无描述)'}
                      {skill.resources.length > 0 ? ` · ${skill.resources.length} 个资源` : ''}
                    </Text>
                  </Flexbox>
                  <Icon
                    icon={ChevronDown}
                    size={16}
                    style={{
                      flexShrink: 0,
                      opacity: 0.5,
                      transform: open ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}
                  />
                </Flexbox>

                {open && (
                  <pre
                    style={{
                      borderLeft: '2px solid var(--ant-color-border, rgba(0,0,0,0.12))',
                      color: 'var(--ant-color-text-description, rgba(0,0,0,0.45))',
                      fontFamily: 'inherit',
                      fontSize: 12.5,
                      lineHeight: 1.7,
                      margin: 0,
                      maxHeight: 320,
                      overflowY: 'auto',
                      paddingLeft: 10,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {skill.content}
                  </pre>
                )}
              </Flexbox>
            );
          })}
        </Flexbox>
      </AsyncBoundary>
    </Flexbox>
  );
}
