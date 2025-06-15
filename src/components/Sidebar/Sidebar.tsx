"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, getCurrentUser } from '@/lib/auth';
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
  FiPackage,
  FiClock,
  FiCheckCircle,
  FiUserCheck,
  FiUserPlus,
  FiShield
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
  superAdminOnly?: boolean;
}

const sidebarItems: SidebarItem[] = [
  { 
    title: 'Cầm đồ', 
    path: '/pawns', 
    icon: <FiShoppingBag size={20} />,
  },
  { 
    title: 'Tín chấp', 
    path: '/credits', 
    icon: <FiCreditCard size={20} />,
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
      { title: 'Tổng quát chuỗi cửa hàng', path: '/stores/overview', icon: <FiUsers size={18} /> },
      { title: 'Thông tin chi tiết cửa hàng', path: '/stores/detail', icon: <FiUserPlus size={18} />, redColor: true },
      { title: 'Danh sách cửa hàng', path: '/stores', icon: <FiUserCheck size={18} /> },
      { title: 'Cấu hình hàng hóa', path: '/stores/collaterals', icon: <FiUserCheck size={18} /> },
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
      { title: 'Hoạt động chi', path: '/outgoing', icon: <FiDollarSign size={18} /> },
    ],
    // redColor: true,
  },
  { 
    title: 'Nhân viên', 
    path: '/employees',   
    icon: <FiUsers size={20} />,
    submenu: [
      { title: 'Danh sách nhân viên', path: '/employees', icon: <FiUsers size={18} /> },
      { title: 'Phân quyền nhân viên', path: '/employee-permissions', icon: <FiUserPlus size={18} /> },
    ]
  },
  { 
    title: 'Quỹ', 
    path: '/total-fund', 
    icon: <FiActivity size={20} />
  },
  { 
    title: 'Báo cáo', 
    path: '/reports', 
    icon: <FiActivity size={20} />,
    submenu: [
      { title: 'Số quỹ tiền mặt', path: '/reports/cashbook', icon: <FiDollarSign size={18} /> },
      { title: 'Tổng kết giao dịch', path: '/reports/transactionSummary', icon: <FiAlertTriangle size={18} /> },
      { title: 'Tổng kết lợi nhuận', path: '/reports/profit', icon: <FiPackage size={18} /> },
      { title: 'Chi tiết tiền lãi', path: '/reports/interestDetail', icon: <FiPackage size={18} /> },
      { title: 'Báo cáo đang cho vay', path: '/reports/report-pawn-holding', icon: <FiPackage size={18} /> },
      { title: 'Báo cáo chuộc đồ, đóng HĐ', path: '/reports/contractClose', icon: <FiPackage size={18} /> },
      { title: 'Báo cáo hợp đồng đã xóa', path: '/reports/contractDeleted', icon: <FiPackage size={18} /> },
      { title: 'Dòng tiền theo ngày', path: '/reports/money-by-day', icon: <FiPackage size={18} /> },
    ]
  },
  // SuperAdmin section
  { 
    title: 'Quản trị hệ thống', 
    path: '/admins', 
    icon: <FiShield size={20} />,
    superAdminOnly: true,
    submenu: [
      { title: 'Quản lý Admin', path: '/admins', icon: <FiShield size={18} /> },
    ]
  },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isFiltering, setIsFiltering] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  // Get current user to check role
  useEffect(() => {
    const fetchUser = async () => {
      try {
        setIsFiltering(true);
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setIsLoadingUser(false);
        setIsFiltering(false);
      }
    };

    fetchUser();
  }, []);

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

  // Filter sidebar items based on user role
  const getFilteredSidebarItems = () => {
    if (isLoadingUser || isFiltering) return [];
    
    // If user is superadmin, only show SuperAdmin items
    if (currentUser?.role === 'superadmin') {
      return sidebarItems.filter(item => item.superAdminOnly);
    }
    
    // For other users, show all items except SuperAdmin ones
    return sidebarItems.filter(item => !item.superAdminOnly);
  };

  // Don't render content while filtering
  if (isFiltering) {
    return (
      <div className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-white shadow-lg transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      } z-40`}>
        <div className="flex h-12 items-center justify-between px-4 border-b">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-medium text-gray-600">Menu điều hướng</h2>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {isCollapsed ? <FiMenu size={20} /> : <FiChevronLeft size={20} />}
          </button>
        </div>
        <div className="p-4 flex items-center justify-center h-[calc(100vh-3.5rem-3rem)]">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-white shadow-lg transition-all duration-300 ${
      isCollapsed ? 'w-20' : 'w-64'
    } z-40`}>
      <div className="flex h-12 items-center justify-between px-4 border-b">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-medium text-gray-600">Menu điều hướng</h2>
            {currentUser?.role === 'superadmin' && (
              <span className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded-full font-medium">
                SUPERADMIN
              </span>
            )}
          </div>
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
          {getFilteredSidebarItems().map((item) => (
            <li key={item.path}>
              {item.submenu ? (
                <div>
                  <button
                    onClick={() => toggleExpanded(item.path)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors ${
                      isItemActive(item)
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    } ${isCollapsed ? 'justify-center' : ''} ${
                      item.superAdminOnly ? 'border-2' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!isCollapsed && (
                        <span className={item.redColor ? 'text-red-600 font-medium' : ''}>
                          {item.title}
                        </span>
                      )}
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
                            <span className={subItem.redColor ? 'text-red-600 font-medium' : ''}>
                              {subItem.title}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Link
                  href={item.path}
                  className={`flex items-center space-x-3 p-2.5 rounded-lg transition-colors ${
                    pathname.startsWith(item.path)
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  } ${isCollapsed ? 'justify-center' : ''} ${
                    item.superAdminOnly ? 'border-2' : ''
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!isCollapsed && (
                    <span className={item.redColor ? 'text-red-600 font-medium' : ''}>
                      {item.title}
                    </span>
                  )}
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