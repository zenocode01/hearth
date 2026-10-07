import type { PropsWithChildren } from 'react';

import { AppThemeProvider } from '@/components/AppThemeProvider';

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <body>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
