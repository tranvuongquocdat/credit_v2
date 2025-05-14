"use client";
import { ReactNode } from 'react';
import { Sidebar } from '../Sidebar';
import { TopNavbar } from './TopNavbar';
import { StoreProvider } from '@/contexts/StoreContext';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <StoreProvider>
      <div className="flex flex-col min-h-screen bg-gray-50">
        <TopNavbar />
        <div className="flex flex-1 pt-14"> {/* Add pt-14 to account for the fixed navbar height */}
          <Sidebar />
          <main className="flex-1 ml-64 p-8 transition-all">
            {children}
          </main>
        </div>
      </div>
    </StoreProvider>
  );
}
