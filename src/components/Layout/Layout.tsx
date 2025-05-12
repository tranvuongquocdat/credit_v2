"use client";
import { ReactNode } from 'react';
import { Sidebar } from '../Sidebar';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 transition-all">
        {children}
      </main>
    </div>
  );
}
