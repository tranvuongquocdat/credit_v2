import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { StoreProvider } from "@/contexts/StoreContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SidebarCollapseProvider } from "@/contexts/SidebarCollapseContext";
import { ReactQueryProvider } from '@/components/ReactQueryProvider';
import { CacheDebugger } from '@/components/CacheDebugger';
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar-collapse";
import { getDisplayLabelByBuild } from "@/utils/nav-display-labels";

// Không cần import font từ Google Fonts vì sẽ sử dụng Arial (system font)

export const metadata: Metadata = {
  title: getDisplayLabelByBuild('title_build'),
  description: getDisplayLabelByBuild('title_build'),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <html lang="vi">
      <body
        className="antialiased"
        style={{ 
          backgroundColor: '#f5f5f5', 
          color: '#333',
          fontFamily: 'Arial, sans-serif' 
        }}
      >
        <ReactQueryProvider>
          <AuthProvider>
            <StoreProvider>
              <SidebarCollapseProvider initialCollapsed={initialSidebarCollapsed}>
                {children}
              </SidebarCollapseProvider>
              <Toaster />
            </StoreProvider>
          </AuthProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
