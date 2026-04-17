/** Cookie đồng bộ SSR + client: tránh flash khi Layout remount theo từng page. */
export const SIDEBAR_COLLAPSED_COOKIE = "sidebar-collapsed";

export function persistSidebarCollapsedCookie(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
