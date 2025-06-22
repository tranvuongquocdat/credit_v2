import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { StoreProvider } from "@/contexts/StoreContext";
import { AuthProvider } from "@/contexts/AuthContext";

// Không cần import font từ Google Fonts vì sẽ sử dụng Arial (system font)

export const metadata: Metadata = {
  title: "Hosodep",
  description: "Ứng dụng quản lý tín dụng",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <AuthProvider>
          <StoreProvider>
            {children}
            <Toaster />
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
