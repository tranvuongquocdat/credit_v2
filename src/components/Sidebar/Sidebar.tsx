"use client";
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
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
  FiShield,
  FiPercent,
  FiXCircle,
  FiCalendar,
  FiPieChart
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
  adminOnly?: boolean;
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
    icon: <FiCalendar size={20} />
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
      { title: 'Tổng quát chuỗi cửa hàng', path: '/stores/overview', icon: <FiPieChart size={18} /> },
      { title: 'Thông tin chi tiết cửa hàng', path: '/stores/detail', icon: <FiFileText size={18} /> },
      { title: 'Danh sách cửa hàng', path: '/stores', icon: <FiShoppingBag size={18} /> },
      { title: 'Cấu hình hàng hóa', path: '/stores/collaterals', icon: <FiPackage size={18} /> },
    ]
  },
  {
    title: 'Nguồn vốn',
    path: '/capital',
    icon: <FiTrendingUp size={20} />
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
    icon: <FiPieChart size={20} />,
    adminOnly: true
  },
  { 
    title: 'Báo cáo', 
    path: '/reports', 
    icon: <FiActivity size={20} />,
    submenu: [
      { title: 'Số quỹ tiền mặt', path: '/reports/cashbook', icon: <FiDollarSign size={18} /> },
      { title: 'Tổng kết giao dịch', path: '/reports/transactionSummary', icon: <FiAlertTriangle size={18} /> },
      { title: 'Tổng kết lợi nhuận', path: '/reports/profitSummary', icon: <FiTrendingUp size={18} /> },
      { title: 'Chi tiết tiền lãi', path: '/reports/interestDetail', icon: <FiPercent size={18} /> },
      { title: 'Báo cáo đang cho vay', path: '/reports/loanReport', icon: <FiClock size={18} /> },
      { title: 'Báo cáo chuộc đồ, đóng HĐ', path: '/reports/contractClose', icon: <FiCheckCircle size={18} /> },
      { title: 'Báo cáo hợp đồng đã xóa', path: '/reports/contractDeleted', icon: <FiXCircle size={18} /> },
      { title: 'Dòng tiền theo ngày', path: '/reports/money-by-day', icon: <FiCalendar size={18} /> },
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

  // Đọc user & trạng thái loading từ AuthContext (đã cache ở AuthProvider)
  const { user: currentUser, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = usePermissions();

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

  // Filter sidebar items based on user role and permissions
  const getFilteredSidebarItems = () => {
    if (authLoading) return [];
    
    // If user is superadmin, only show SuperAdmin items
    if (currentUser?.role === 'superadmin') {
      return sidebarItems.filter(item => item.superAdminOnly);
    }
    
    // For other users, filter based on permissions
    return sidebarItems
      .filter(item => {
        // Filter out superadmin-only items for non-superadmin users
        if (item.superAdminOnly && currentUser?.role !== 'superadmin') {
          return false;
        }
        
        // Filter out admin-only items for non-admin and non-superadmin users
        if (item.adminOnly && !['admin', 'superadmin'].includes(currentUser?.role)) {
          return false;
        }

        return true;
      })
      .map(item => {
        // Special handling for the Stores menu
        if (item.path === '/stores' && item.submenu) {
          const filteredSubmenu = item.submenu.filter(subItem => {
            // Check permissions for each submenu item
            if (subItem.path === '/stores/overview') {
              return hasPermission('tong_quat_chuoi_cua_hang');
            }
            if (subItem.path === '/stores/detail') {
              return hasPermission('thong_tin_chi_tiet_cua_hang');
            }
            if (subItem.path === '/stores') {
              return hasPermission('danh_sach_cua_hang');
            }
            if (subItem.path === '/stores/collaterals') {
              return hasPermission('cau_hinh_hang_hoa');
            }
            return true; // Keep other submenu items
          });
          
          // Only return the item if it has submenu items
          return filteredSubmenu.length > 0 
            ? { ...item, submenu: filteredSubmenu } 
            : null;
        }
        
        // Special handling for the Employees menu
        if (item.path === '/employees' && item.submenu) {
          const filteredSubmenu = item.submenu.filter(subItem => {
            // Check permissions for each submenu item
            if (subItem.path === '/employees') {
              return hasPermission('danh_sach_nhan_vien');
            }
            if (subItem.path === '/employee-permissions') {
              return hasPermission('phan_quyen_nhan_vien');
            }
            return true; // Keep other submenu items
          });
          
          // Only return the item if it has submenu items
          return filteredSubmenu.length > 0 
            ? { ...item, submenu: filteredSubmenu } 
            : null;
        }
        
        // Special handling for Reports menu
        if (item.path === '/reports' && item.submenu) {
          const filteredSubmenu = item.submenu.filter(subItem => {
            // Check permissions for each submenu item
            if (subItem.path === '/reports/cashbook') {
              return hasPermission('so_quy_tien_mat');
            }
            if (subItem.path === '/reports/transactionSummary') {
              return hasPermission('tong_ket_giao_dich');
            }
            if (subItem.path === '/reports/profitSummary') {
              return hasPermission('tong_ket_loi_nhuan');
            }
            if (subItem.path === '/reports/interestDetail') {
              return hasPermission('chi_tiet_tien_lai');
            }
            if (subItem.path === '/reports/loanReport') {
              return hasPermission('bao_cao_dang_cho_vay');
            }
            if (subItem.path === '/reports/contractClose') {
              return hasPermission('bao_cao_dong_hop_dong');
            }
            if (subItem.path === '/reports/contractDeleted') {
              return hasPermission('bao_cao_hop_dong_da_xoa');
            }
            if (subItem.path === '/reports/money-by-day') {
              return hasPermission('dong_tien_theo_ngay');
            }
            return true; // Keep other submenu items
          });
          
          // Only return the item if it has submenu items
          return filteredSubmenu.length > 0 
            ? { ...item, submenu: filteredSubmenu } 
            : null;
        }
        
        // Check permission for Customers menu
        if (item.path === '/customers') {
          return hasPermission('xem_danh_sach_khach_hang') ? item : null;
        }
        
        // Check permission for Capital menu
        if (item.path === '/capital') {
          return hasPermission('quan_ly_nguon_von') ? item : null;
        }
        
        // Check permissions for Income/Outgoing menu
        if (item.path === '/income' && item.submenu) {
          const filteredSubmenu = item.submenu.filter(subItem => {
            // Check permission for each submenu item
            if (subItem.path === '/income') {
              return hasPermission('hoat_dong_thu');
            }
            if (subItem.path === '/outgoing') {
              return hasPermission('hoat_dong_chi');
            }
            return true; // Keep other submenu items
          });
          
          // Only return the item if it has submenu items
          return filteredSubmenu.length > 0 
            ? { ...item, submenu: filteredSubmenu } 
            : null;
        }
        
        return item;
      })
      .filter(Boolean) as SidebarItem[]; // Filter out null items
  };

  // Don't render content while filtering
  if (authLoading) {
    return (
      <div className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-white shadow-lg transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      } z-40`}>
        <div className="flex h-12 items-center px-4 border-b">
          {!isCollapsed ? (
            <>
              <div className="flex items-center space-x-2 flex-1">
                <h2 className="text-sm font-medium text-gray-600">Menu điều hướng</h2>
              </div>
              <button
                onClick={toggleCollapsed}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <FiChevronLeft size={20} />
              </button>
            </>
          ) : (
            <div className="w-full flex justify-center">
              <button
                onClick={toggleCollapsed}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <FiMenu size={20} />
              </button>
            </div>
          )}
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
      <div className="flex h-12 items-center px-4 border-b">
        {!isCollapsed ? (
          <>
            <div className="flex items-center space-x-2 flex-1">
              <h2 className="text-sm font-medium text-gray-600">Menu điều hướng</h2>
              {currentUser?.role === 'superadmin' && (
                <span className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded-full font-medium">
                  SUPERADMIN
                </span>
              )}
            </div>
            <button
              onClick={toggleCollapsed}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <FiChevronLeft size={20} />
            </button>
          </>
        ) : (
          <div className="w-full flex justify-center">
            <button
              onClick={toggleCollapsed}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FiMenu size={20} />
            </button>
          </div>
        )}
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
                localStorage.removeItem('currentStoreId');
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