"use client";
import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from '../Sidebar';
import { TopNavbar } from './TopNavbar';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  useEffect(() => {
    const handleSidebarToggle = (event: CustomEvent<{ isCollapsed: boolean | null }>) => {
      if (event.detail.isCollapsed === null) {
        // Toggle current state
        setSidebarCollapsed(prev => !prev);
      } else {
        // Set to specific state
        setSidebarCollapsed(event.detail.isCollapsed);
      }
    };
    
    // TypeScript requires this cast for custom events
    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
    
    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <TopNavbar />
      <div className="flex flex-1 pt-14">
        <Sidebar />
        <main className={`flex-1 transition-all duration-300 ease-in-out p-8 ${
          sidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}>
          {children}
        </main>
      </div>
    </div>
  );
}
