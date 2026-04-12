"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  SIDEBAR_COLLAPSED_COOKIE,
  persistSidebarCollapsedCookie,
} from "@/lib/sidebar-collapse";

const LEGACY_LOCALSTORAGE_KEY = "nuvoras-sidebar-collapsed";

type SidebarCollapseContextValue = {
  isCollapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
};

const SidebarCollapseContext = createContext<SidebarCollapseContextValue | null>(null);

export function SidebarCollapseProvider({
  children,
  initialCollapsed,
}: {
  children: ReactNode;
  /** Đọc từ cookie trên server (RootLayout) — lần render đầu đã đúng trạng thái */
  initialCollapsed: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed);
    persistSidebarCollapsedCookie(collapsed);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!isCollapsed);
  }, [isCollapsed, setCollapsed]);

  // Một lần: migrate từ localStorage cũ → cookie (sau đó reload/SSR sẽ không flash)
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (document.cookie.includes(`${SIDEBAR_COLLAPSED_COOKIE}=`)) return;
    try {
      if (localStorage.getItem(LEGACY_LOCALSTORAGE_KEY) === "true") {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, [setCollapsed]);

  const value = useMemo(
    () => ({ isCollapsed, setCollapsed, toggleCollapsed }),
    [isCollapsed, setCollapsed, toggleCollapsed]
  );

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse() {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error("useSidebarCollapse chỉ dùng bên trong SidebarCollapseProvider");
  }
  return ctx;
}
