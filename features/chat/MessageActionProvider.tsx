'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { MessageActions, type MessageActionKey } from './MessageActions';

/**
 * 消息动作栏的**单例 portal**（对标 LobeHub 的 MessageActionProvider）。
 *
 * 不再每条消息都挂一个动作栏，而是**只渲染一个**，portal 到当前 hover 的那条消息的占位里。
 * 好处：DOM 更少、动作栏只在需要时存在；也让"按 role/runtime 决定动作"集中在 MessageActions。
 */
interface ActiveActionBar {
  busy?: boolean;
  canBranch: boolean;
  canEdit: boolean;
  /** portal 目标：被 hover 消息里的占位元素 */
  element: HTMLElement | null;
  onAction: (key: MessageActionKey) => void;
  role: 'assistant' | 'user';
}

interface MessageActionContextValue {
  setActive: (active: ActiveActionBar | null) => void;
}

const MessageActionContext = createContext<MessageActionContextValue | null>(null);

/** 供 MessageItem 使用：hover 时把动作栏"搬"到自己这里。 */
export function useMessageAction(): MessageActionContextValue | null {
  return useContext(MessageActionContext);
}

export function MessageActionProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState<ActiveActionBar | null>(null);
  const setActive = useCallback((next: ActiveActionBar | null) => setActiveState(next), []);
  const value = useMemo(() => ({ setActive }), [setActive]);

  return (
    <MessageActionContext.Provider value={value}>
      {children}
      {active?.element
        ? createPortal(
            <MessageActions
              busy={active.busy}
              canBranch={active.canBranch}
              canEdit={active.canEdit}
              role={active.role}
              onAction={active.onAction}
            />,
            active.element,
          )
        : null}
    </MessageActionContext.Provider>
  );
}
