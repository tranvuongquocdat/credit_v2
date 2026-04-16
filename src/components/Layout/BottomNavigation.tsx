"use client";
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { 
  Store, 
  CreditCard, 
  Calendar, 
  Users, 
  BarChart3,
  TrendingUp,
  DollarSign,
  PieChart,
  ShieldCheck,
  FileText,
  Package,
  UserPlus,
  AlertTriangle,
  Percent,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getNavDisplayLabel, type NavDisplayLabelKey } from '@/utils/nav-display-labels';

interface SubMenuItem {
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  submenu?: SubMenuItem[];
  labelKey: NavDisplayLabelKey;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    label: 'Cầm đồ',
    path: '/pawns',
    labelKey: 'pawns',
    icon: Store
  },
  {
    label: 'Tín chấp',
    path: '/credits',
    labelKey: 'credits',
    icon: CreditCard
  },
  {
    label: 'Trả góp',
    path: '/installments',
    labelKey: 'installments',
    icon: Calendar
  },
  {
    label: 'Khách hàng',
    path: '/customers',
    labelKey: 'customers',
    icon: Users
  },
  {
    label: 'Cửa hàng',
    path: '/stores',
    labelKey: 'stores',
    icon: Store,
    submenu: [
      { title: 'Tổng quát chuỗi cửa hàng', path: '/stores/overview', icon: PieChart },
      { title: 'Thông tin chi tiết cửa hàng', path: '/stores/detail', icon: FileText },
      { title: 'Danh sách cửa hàng', path: '/stores', icon: Store },
      { title: 'Cấu hình hàng hóa', path: '/stores/collaterals', icon: Package },
    ]
  },
  {
    label: 'Nguồn vốn',
    path: '/capital',
    labelKey: 'capital',
    icon: TrendingUp
  },
  {
    label: 'Thu chi',
    path: '/income',
    labelKey: 'income',
    icon: DollarSign,
    submenu: [
      { title: 'Hoạt động thu', path: '/income', icon: DollarSign },
      { title: 'Hoạt động chi', path: '/outgoing', icon: DollarSign },
    ]
  },
  {
    label: 'Nhân viên',
    path: '/employees',
    labelKey: 'employees',
    icon: Users,
    submenu: [
      { title: 'Danh sách nhân viên', path: '/employees', icon: Users },
      { title: 'Phân quyền nhân viên', path: '/employee-permissions', icon: UserPlus },
    ]
  },
  {
    label: 'Quỹ',
    path: '/total-fund',
    labelKey: 'total-fund',
    icon: PieChart,
    adminOnly: true
  },
  {
    label: 'Báo cáo',
    path: '/reports',
    labelKey: 'reports',
    icon: BarChart3,
    submenu: [
      { title: 'Số quỹ tiền mặt', path: '/reports/cashbook', icon: DollarSign },
      { title: 'Tổng kết giao dịch', path: '/reports/transactionSummary', icon: AlertTriangle },
      { title: 'Tổng kết lợi nhuận', path: '/reports/profitSummary', icon: TrendingUp },
      { title: 'Chi tiết tiền lãi', path: '/reports/interestDetail', icon: Percent },
      { title: 'Báo cáo đang cho vay', path: '/reports/loanReport', icon: Clock },
      { title: 'Báo cáo chuộc đồ, đóng HĐ', path: '/reports/contractClose', icon: CheckCircle },
      { title: 'Báo cáo hợp đồng đã xóa', path: '/reports/contractDeleted', icon: XCircle },
      { title: 'Dòng tiền theo ngày', path: '/reports/money-by-day', icon: Calendar },
    ]
  },
  {
    label: 'Quản trị',
    path: '/admins',
    labelKey: 'admins',
    icon: ShieldCheck,
    superAdminOnly: true,
    submenu: [
      { title: 'Quản lý Admin', path: '/admins', icon: ShieldCheck },
    ]
  }
];

export function BottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [submenuOpen, setSubmenuOpen] = useState<string | null>(null);
  const isNuvorasBuild = process.env.NEXT_PUBLIC_BUILD_NAME === 'nuvoras';

  const handleNavigation = (path: string, hasSubmenu?: boolean, itemPath?: string) => {
    if (hasSubmenu) {
      // Open submenu modal
      setSubmenuOpen(itemPath || path);
    } else {
      // Navigate directly
      router.push(path);
      setSubmenuOpen(null);
    }
  };

  const handleSubmenuClick = (path: string) => {
    router.push(path);
    setSubmenuOpen(null);
  };

  const closeSubmenu = () => {
    setSubmenuOpen(null);
  };

  // Filter items based on user role and permissions
  const getFilteredNavItems = () => {
    if (!user) {
      return navItems
        .filter(item => !item.adminOnly && !item.superAdminOnly)
        .filter(item => isNuvorasBuild || (item.path !== '/credits' && item.path !== '/installments'));
    }
    
    // If user is superadmin, only show SuperAdmin items
    if (user.role === 'superadmin') {
      return navItems
        .filter(item => item.superAdminOnly)
        .filter(item => isNuvorasBuild || (item.path !== '/credits' && item.path !== '/installments'));
    }
    
    // For other users, filter based on permissions
    return navItems
      .filter(item => {
        if (item.superAdminOnly && user.role !== 'superadmin') {
          return false;
        }
        if (item.adminOnly && user.role !== 'admin' && user.role !== 'superadmin') {
          return false;
        }
        return true;
      })
      .filter(item => isNuvorasBuild || (item.path !== '/credits' && item.path !== '/installments'));
  };

  const filteredNavItems = getFilteredNavItems();
  const currentSubmenu = submenuOpen ? navItems.find(item => item.path === submenuOpen) : null;

  const resolveNavLabel = (item: NavItem) => getNavDisplayLabel(item.labelKey);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg md:hidden">
        {/* Scrollable navigation container */}
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex min-w-max py-1">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.path);
              const hasSubmenu = item.submenu && item.submenu.length > 0;
              
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigation(item.path, hasSubmenu, item.path)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 min-w-[70px] mx-1 relative ${
                    isActive 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Icon 
                    className={`w-4 h-4 mb-1 ${
                      isActive ? 'text-blue-600' : 'text-gray-600'
                    }`} 
                  />
                  <span className={`text-xs font-medium truncate max-w-[60px] ${
                    isActive ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {resolveNavLabel(item)}
                  </span>
                  {/* Submenu indicator */}
                  {hasSubmenu && (
                    <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                      isActive ? 'bg-blue-600' : 'bg-gray-400'
                    }`}></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Safe area for devices with bottom notch */}
        <div className="pb-safe-area-inset-bottom"></div>
      </div>

      {/* Submenu Modal */}
      {submenuOpen && currentSubmenu && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={closeSubmenu}
          ></div>
          
          {/* Modal Content */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[70vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <currentSubmenu.icon className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  {resolveNavLabel(currentSubmenu)}
                </h3>
              </div>
              <button
                onClick={closeSubmenu}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            {/* Submenu Items */}
            <div className="overflow-y-auto max-h-[calc(70vh-80px)]">
              <div className="p-2">
                {currentSubmenu.submenu?.map((subItem) => {
                  const SubIcon = subItem.icon;
                  const isSubActive = pathname.startsWith(subItem.path);
                  
                  return (
                    <button
                      key={subItem.path}
                      onClick={() => handleSubmenuClick(subItem.path)}
                      className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors duration-200 ${
                        isSubActive
                          ? 'bg-blue-50 text-blue-600 border border-blue-200'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <SubIcon className={`w-5 h-5 ${
                        isSubActive ? 'text-blue-600' : 'text-gray-500'
                      }`} />
                      <span className={`text-sm font-medium ${
                        isSubActive ? 'text-blue-600' : 'text-gray-700'
                      }`}>
                        {subItem.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hide scrollbar styles */}
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;  /* Internet Explorer 10+ */
          scrollbar-width: none;  /* Firefox */
        }
        .scrollbar-hide::-webkit-scrollbar { 
          display: none;  /* Safari and Chrome */
        }
      `}</style>
    </>
  );
} 