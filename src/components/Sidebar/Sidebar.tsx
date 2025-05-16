"use client";
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import { 
  FiHome, 
  FiCreditCard, 
  FiSettings, 
  FiUser, 
  FiMenu,
  FiChevronLeft,
  FiActivity,
  FiHelpCircle,
  FiShoppingBag,
  FiUsers,
  FiLogOut
} from 'react-icons/fi';

interface SidebarItem {
  title: string;
  path: string;
  icon: React.ReactElement;
}

const sidebarItems: SidebarItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: <FiHome size={20} /> },
  { title: 'Cửa hàng', path: '/stores', icon: <FiShoppingBag size={20} /> },
  { title: 'Khách hàng', path: '/customers', icon: <FiUsers size={20} /> },
  { title: 'Nhân viên', path: '/employees', icon: <FiUsers size={20} /> },
  { title: 'Tín chấp', path: '/credits', icon: <FiCreditCard size={20} /> },
  { title: 'Trả góp', path: '/installments', icon: <FiCreditCard size={20} /> },
  { title: 'Activities', path: '/activities', icon: <FiActivity size={20} /> },
  { title: 'Profile', path: '/profile', icon: <FiUser size={20} /> },
  { title: 'Settings', path: '/settings', icon: <FiSettings size={20} /> },
  { title: 'Help', path: '/help', icon: <FiHelpCircle size={20} /> },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div 
      className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-white shadow-lg transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="flex h-12 items-center justify-between px-4 border-b">
        {!isCollapsed && (
          <h2 className="text-sm font-medium text-gray-600">Menu điều hướng</h2>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {isCollapsed ? <FiMenu size={20} /> : <FiChevronLeft size={20} />}
        </button>
      </div>

      <nav className="p-4 flex flex-col h-[calc(100vh-3.5rem-3rem)]">
        <ul className="space-y-2 flex-grow">
          {sidebarItems.map((item) => (
            <li key={item.path}>
              <Link
                href={item.path}
                className={`flex items-center space-x-3 p-2.5 rounded-lg transition-colors ${
                  pathname.startsWith(item.path)
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                } ${isCollapsed ? 'justify-center' : ''}`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!isCollapsed && <span>{item.title}</span>}
              </Link>
            </li>
          ))}
        </ul>
        
        {/* Nút đăng xuất ở dưới cùng */}
        <div className="mt-auto pt-4 border-t">
          <button
            onClick={async () => {
              try {
                setIsLoggingOut(true);
                await signOut();
                router.push('/login');
                router.refresh();
              } catch (error) {
                console.error('Lỗi khi đăng xuất:', error);
              } finally {
                setIsLoggingOut(false);
              }
            }}
            disabled={isLoggingOut}
            className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors text-red-600 hover:bg-red-50 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <span className="flex-shrink-0">
              <FiLogOut size={20} />
            </span>
            {!isCollapsed && (
              <span>{isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}</span>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}
