"use client";
import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from '../Sidebar';
import { TopNavbar } from './TopNavbar';
import { BottomNavigation } from './BottomNavigation';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
      setSidebarCollapsed(prev => !prev);
    };
    
    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
    return () => window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <TopNavbar />
      
      <div className="flex flex-1 pt-14">
        {/* Desktop/Tablet Sidebar - Hidden on mobile */}
        <div className={`hidden md:block ${sidebarCollapsed ? 'w-20' : 'w-64'} transition-all duration-300`}>
          <Sidebar />
        </div>
        
        {/* Main Content */}
        <main className={`
          flex-1 
          p-2 md:p-8 
          min-w-0
          ${isMobile ? 'pb-20' : 'pb-4'}
        `}>
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}
