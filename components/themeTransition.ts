import { flushSync } from 'react-dom';

import { THEME_TRANSITION_EASE, THEME_TRANSITION_MS } from './theme';

/** 主题切换动画效果。 */
export type ThemeTransitionEffect = 'fade' | 'circle' | 'none';

/** 效果偏好存 localStorage（纯客户端行为，无需 SSR，故不用 cookie）。 */
export const THEME_EFFECT_STORAGE_KEY = 'hearth-theme-effect';
/** 旧项目名时期的 key：读取时兼容一次，用户偏好不丢 */
const LEGACY_THEME_EFFECT_STORAGE_KEY = 'pi-theme-effect';

const CIRCLE_DURATION_MS = 520;

interface ViewTransitionDocument {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
}

// 记录最近一次指针位置，作为圆形扩散的圆心（主题切换按钮点击处）。
let lastPointer: { x: number; y: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (event) => {
      lastPointer = { x: event.clientX, y: event.clientY };
    },
    { capture: true, passive: true },
  );
}

export function readStoredEffect(): ThemeTransitionEffect {
  try {
    // 新 key 优先；没有则回落到旧 key（改名迁移，用户偏好不丢）
    const stored =
      localStorage.getItem(THEME_EFFECT_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_THEME_EFFECT_STORAGE_KEY);
    return stored === 'fade' || stored === 'circle' || stored === 'none' ? stored : 'circle';
  } catch {
    return 'circle';
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 临时注入全局样式，返回移除函数并附带兜底清理。 */
function withTemporaryStyle(css: string, ttlMs: number): () => void {
  const style = document.createElement('style');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
  void document.body.offsetHeight; // 强制重排，让样式在本轮提交前生效
  const timer = setTimeout(() => style.remove(), ttlMs);
  return () => {
    clearTimeout(timer);
    style.remove();
  };
}

/** 瞬时切换：用于首屏系统解析与"无动画"效果。 */
export function applyInstantly(update: () => void): void {
  if (typeof document === 'undefined') {
    update();
    return;
  }
  withTemporaryStyle('*,*::before,*::after{transition:none!important}', 400);
  update();
}

function resolveOrigin(): { x: number; y: number } {
  return lastPointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function uniformColorTransitionCss(): string {
  return (
    `*,*::before,*::after{transition:background-color ${THEME_TRANSITION_MS}ms ${THEME_TRANSITION_EASE},` +
    `color ${THEME_TRANSITION_MS}ms ${THEME_TRANSITION_EASE},` +
    `border-color ${THEME_TRANSITION_MS}ms ${THEME_TRANSITION_EASE}!important}`
  );
}

/**
 * 执行主题切换动画：
 * - `fade`   整页交叉淡入（View Transitions 快照）
 * - `circle` 从点击位置圆形扩散揭示（View Transitions + clip-path）
 * - `none`   瞬时切换
 * 不支持 View Transitions 时统一降级为"颜色过渡"；prefers-reduced-motion 时瞬时切换。
 */
export function runThemeTransition(
  update: () => void,
  effect: ThemeTransitionEffect,
  origin?: { x: number; y: number },
): void {
  if (typeof document === 'undefined') {
    update();
    return;
  }
  if (effect === 'none' || prefersReducedMotion()) {
    applyInstantly(update);
    return;
  }

  const doc = document as unknown as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== 'function') {
    withTemporaryStyle(uniformColorTransitionCss(), THEME_TRANSITION_MS + 250);
    update();
    return;
  }

  // 真实 DOM 瞬时切换（禁掉逐元素过渡），动画交给快照
  const removeNoTransition = withTemporaryStyle(
    '*,*::before,*::after{transition:none!important}',
    CIRCLE_DURATION_MS + 600,
  );
  const transition = doc.startViewTransition(() => {
    flushSync(update);
  });

  transition.ready
    .then(() => {
      const point = origin ?? resolveOrigin();
      if (effect === 'circle') {
        const radius = Math.hypot(
          Math.max(point.x, window.innerWidth - point.x),
          Math.max(point.y, window.innerHeight - point.y),
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${point.x}px ${point.y}px)`,
              `circle(${radius}px at ${point.x}px ${point.y}px)`,
            ],
          },
          {
            duration: CIRCLE_DURATION_MS,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      } else {
        document.documentElement.animate(
          { opacity: [1, 0] },
          {
            duration: THEME_TRANSITION_MS,
            easing: THEME_TRANSITION_EASE,
            pseudoElement: '::view-transition-old(root)',
          },
        );
        document.documentElement.animate(
          { opacity: [0, 1] },
          {
            duration: THEME_TRANSITION_MS,
            easing: THEME_TRANSITION_EASE,
            pseudoElement: '::view-transition-new(root)',
          },
        );
      }
    })
    .catch(() => {
      /* 过渡被跳过时忽略 */
    });

  transition.finished.finally(removeNoTransition);
}
