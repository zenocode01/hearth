'use client';

import { useEffect, useState } from 'react';

/**
 * 订阅一个媒体查询。首帧固定返回 false（SSR 安全：服务端没有 viewport 信息），
 * 挂载后再按真实值更新——因为整个应用壳本来就是客户端渲染（见 AppThemeRoot），
 * 这里不会造成水合不一致。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** 手机竖屏（< 768px）：与 refs 的移动端断点一致 */
export const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
