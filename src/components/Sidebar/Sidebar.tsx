"use client";
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  FiUsers
} from 'react-icons/fi';

interface SidebarItem {
  title: string;
  path: string;
  icon: React.ReactElement;
}

const sidebarItems: SidebarItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: <FiHome size={20} /> },
  { title: 'Cửa hàng', path: '/stores', icon: <FiShoppingBag size={20} /> },
  { title: 'Nhân viên', path: '/employees', icon: <FiUsers size={20} /> },
  { title: 'Credit', path: '/credit', icon: <FiCreditCard size={20} /> },
  { title: 'Activities', path: '/activities', icon: <FiActivity size={20} /> },
  { title: 'Profile', path: '/profile', icon: <FiUser size={20} /> },
  { title: 'Settings', path: '/settings', icon: <FiSettings size={20} /> },
  { title: 'Help', path: '/help', icon: <FiHelpCircle size={20} /> },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div 
      className={`fixed left-0 top-0 h-screen bg-white shadow-lg transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!isCollapsed && (
          <h1 className="text-xl font-bold text-gray-800">Credit App</h1>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {isCollapsed ? <FiMenu size={24} /> : <FiChevronLeft size={24} />}
        </button>
      </div>

      <nav className="p-4">
        <ul className="space-y-2">
          {sidebarItems.map((item) => (
            <li key={item.path}>
              <Link
                href={item.path}
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                  pathname === item.path
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
      </nav>
    </div>
  );
}
