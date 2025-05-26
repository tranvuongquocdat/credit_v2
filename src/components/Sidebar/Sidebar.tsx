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
  FiLogOut,
  FiDollarSign,
  FiAlertTriangle,
  FiChevronDown,
  FiChevronRight,
  FiFileText,
  FiTrendingUp,
  FiPieChart,
  FiBarChart,
  FiPackage,
  FiClock,
  FiCheckCircle,
  FiUserCheck,
  FiUserPlus
} from 'react-icons/fi';

interface SubMenuItem {
  title: string;
  path: string;
  icon: React.ReactElement;
  redColor?: boolean;
}

interface SidebarItem {
  title: string;
  path: string;
  icon: React.ReactElement;
  submenu?: SubMenuItem[];
  redColor?: boolean;
}

const sidebarItems: SidebarItem[] = [
  { 
    title: 'Cầm đồ', 
    path: '/pawns', 
    icon: <FiShoppingBag size={20} />,
    redColor: true,
    submenu: [
      { title: 'Quản lý cầm đồ', path: '/pawns', icon: <FiShoppingBag size={18} /> },
      { title: 'Cảnh báo cầm đồ', path: '/pawn-warnings', icon: <FiAlertTriangle size={18} />, redColor: true },
    ]
  },
  { 
    title: 'Tín chấp', 
    path: '/credits', 
    icon: <FiCreditCard size={20} />,
    redColor: true,
  },
  { 
    title: 'Trả góp', 
    path: '/installments', 
    icon: <FiCreditCard size={20} />
  },
  { 
    title: 'Khách hàng', 
    path: '/customers', 
    icon: <FiUsers size={20} />
  },
  { 
    title: 'Cửa hàng', 
    path: '/stores', 
    icon: <FiShoppingBag size={20} />,
    submenu: [
      { title: 'Tổng quát chuỗi cửa hàng', path: '/stores', icon: <FiUsers size={18} />, redColor: true },
      { title: 'Thông tin chi tiết cửa hàng', path: '/stores', icon: <FiUserPlus size={18} />, redColor: true },
      { title: 'Danh sách cửa hàng', path: '/stores', icon: <FiUserCheck size={18} /> },
      { title: 'Cấu hình hàng hóa', path: '/stores/collaterals', icon: <FiUserCheck size={18} /> },
      { title: 'Nhập tiền quỹ đầu ngày', path: '/stores', icon: <FiUserCheck size={18} />, redColor: true },
    ]
  },
  {
    title: 'Nguồn vốn',
    path: '/capital',
    icon: <FiDollarSign size={20} />
  },
  { 
    title: 'Thu chi', 
    path: '/income', 
    icon: <FiDollarSign size={20} />,
    submenu: [
      { title: 'Hoạt động thu', path: '/income', icon: <FiDollarSign size={18} /> },
      { title: 'Hoạt động chi', path: '/capital', icon: <FiDollarSign size={18} /> },
    ],
    redColor: true,
  },
  { 
    title: 'Nhân viên', 
    path: '/employees',   
    icon: <FiUsers size={20} />,
    submenu: [
      { title: 'Danh sách nhân viên', path: '/employees', icon: <FiUsers size={18} /> },
      { title: 'Phân quyền nhân viên', path: '/employees', icon: <FiUserPlus size={18} />, redColor: true },
    ]
  },
  { 
    title: 'Thống kê', 
    path: '/activities', 
    icon: <FiActivity size={20} />,
    redColor: true,
    submenu: [
      { title: 'Thu tiền tín chấp', path: '/activities/overview', icon: <FiPieChart size={18} /> },
      { title: 'Thu tiền trả góp', path: '/activities/daily', icon: <FiBarChart size={18} /> },
    ]
  },
  { 
    title: 'Báo cáo', 
    path: '/reports', 
    icon: <FiActivity size={20} />,
    redColor: true,
    submenu: [
      { title: 'Số quỹ tiền mặt', path: '/reports/revenue', icon: <FiDollarSign size={18} /> },
      { title: 'Tổng kết giao dịch', path: '/reports/bad-debt', icon: <FiAlertTriangle size={18} /> },
      { title: 'Tổng kết lợi nhuận', path: '/reports/inventory', icon: <FiPackage size={18} /> },
      { title: 'Chi tiết tiền lãi', path: '/reports/inventory', icon: <FiPackage size={18} /> },
      { title: 'Báo cáo đang cho vay', path: '/reports/inventory', icon: <FiPackage size={18} /> },
      { title: 'Báo cáo chuộc đồ, đóng HĐ', path: '/reports/inventory', icon: <FiPackage size={18} /> },
      { title: 'Báo cáo thanh lý đồ', path: '/reports/inventory', icon: <FiPackage size={18} /> },
      { title: 'Báo cáo hợp đồng đã xóa', path: '/reports/inventory', icon: <FiPackage size={18} /> },
      { title: 'Bàn giao ca', path: '/reports/inventory', icon: <FiPackage size={18} /> },
      { title: 'Dòng tiền theo ngày', path: '/reports/inventory', icon: <FiPackage size={18} /> },
    ]
  },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  const toggleExpanded = (path: string) => {
    if (isCollapsed) return; // Không mở submenu khi sidebar thu gọn
    
    setExpandedItems(prev => 
      prev.includes(path) 
        ? prev.filter(item => item !== path)
        : [...prev, path]
    );
  };

  const isItemActive = (item: SidebarItem) => {
    if (item.submenu) {
      return item.submenu.some(subItem => pathname.startsWith(subItem.path)) || pathname.startsWith(item.path);
    }
    return pathname.startsWith(item.path);
  };

  const isSubItemActive = (subPath: string) => {
    return pathname.startsWith(subPath);
  };

  const toggleCollapsed = () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    
    // Dispatch a custom event for Layout to listen to
    const event = new CustomEvent('sidebar-toggle', { detail: { isCollapsed: newCollapsedState } });
    window.dispatchEvent(event);
  };

  return (
    <div 
      className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-white shadow-lg transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      } z-40`}
    >
      <div className="flex h-12 items-center justify-between px-4 border-b">
        {!isCollapsed && (
          <h2 className="text-sm font-medium text-gray-600">Menu điều hướng</h2>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {isCollapsed ? <FiMenu size={20} /> : <FiChevronLeft size={20} />}
        </button>
      </div>

      <nav className="p-4 flex flex-col h-[calc(100vh-3.5rem-3rem)] overflow-y-auto">
        <ul className="space-y-1 flex-grow">
          {sidebarItems.map((item) => (
            <li key={item.path}>
              {item.submenu ? (
                // Item có submenu
                <div>
                  <button
                    onClick={() => toggleExpanded(item.path)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors ${
                      isItemActive(item)
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    } ${isCollapsed ? 'justify-center' : ''}`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!isCollapsed && <span className={item.redColor ? 'text-red-600' : ''}>{item.title}</span>}
                    </div>
                    {!isCollapsed && (
                      <span className="flex-shrink-0">
                        {expandedItems.includes(item.path) ? 
                          <FiChevronDown size={16} /> : 
                          <FiChevronRight size={16} />
                        }
                      </span>
                    )}
                  </button>
                  
                  {/* Submenu */}
                  {!isCollapsed && expandedItems.includes(item.path) && (
                    <ul className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-4">
                      {item.submenu.map((subItem) => (
                        <li key={subItem.path}>
                          <Link
                            href={subItem.path}
                            className={`flex items-center space-x-3 p-2 rounded-lg transition-colors text-sm ${
                              isSubItemActive(subItem.path)
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <span className="flex-shrink-0">{subItem.icon}</span>
                            <span className={subItem.redColor ? 'text-red-600' : ''}>{subItem.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                // Item không có submenu
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
              )}
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