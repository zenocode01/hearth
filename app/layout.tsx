import { cookies } from 'next/headers';
import type { PropsWithChildren } from 'react';

import './globals.css';

import { AppThemeRoot } from '@/components/AppThemeRoot';
import { THEME_COOKIE, type ThemeMode } from '@/components/theme';

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export default async function RootLayout({ children }: PropsWithChildren) {
  // 服务端读取主题偏好：SSR 与首帧一致，避免水合错配与白闪。
  const cookieStore = await cookies();
  const stored = cookieStore.get(THEME_COOKIE)?.value;
  const initialMode: ThemeMode = isThemeMode(stored) ? stored : 'auto';

  return (
    <html data-theme={initialMode} lang="zh-CN" suppressHydrationWarning>
      <body>
        <AppThemeRoot initialMode={initialMode}>{children}</AppThemeRoot>
      </body>
    </html>
  );
}
