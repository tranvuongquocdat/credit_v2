"use client";
import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from '../Sidebar';
import { TopNavbar } from './TopNavbar';
import { BottomNavigation } from './BottomNavigation';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Default to collapsed
  const [isMobile, setIsMobile] = useState(false);
  
  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  useEffect(() => {
    const handleSidebarToggle = (event: CustomEvent) => {
      setSidebarCollapsed(event.detail.isCollapsed);
    };
    
    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
    return () => window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Fixed top navigation bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <TopNavbar />
      </div>
      
      <div className="flex flex-1 pt-14">
        {/* Sidebar is positioned fixed */}
        <div className="hidden md:block">
          <Sidebar />
        </div>
        
        {/* Main Content - Adjust margin based on sidebar state */}
        <main className={`
          flex-1 
          p-2 md:p-8 
          min-w-0
          transition-all duration-300
          ${isMobile ? 'pb-20' : 'pb-4'}
          ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}
        `}>
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}
