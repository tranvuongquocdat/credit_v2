"use client";

import { Settings, User, Bike, DollarSign, Salad, Folder, ChevronDown, LogOut, Bell } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect, memo, useCallback, useRef } from "react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";
import { countInstallmentWarnings } from "@/lib/installmentPayment";
import { countPawnWarnings } from "@/lib/pawn-warnings";
import { countCreditWarnings } from "@/lib/credit-warnings";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { startPerfTimer } from "@/lib/perf-debug";
import { getNavDisplayLabel, isNuvorasBuild as getIsNuvorasBuild } from "@/utils/nav-display-labels";

// This interface will represent the notification data structure
interface NotificationCounts {
  storeInvoices: number;
  appointments: number;
  pawnInvoices: number;
  loanInvoices: number;
  installmentInvoices: number;
}

// Memomized Store Dropdown Button để tránh re-render không cần thiết
const StoreDropdown = memo(({ 
  currentStore, 
  stores, 
  loading, 
  onSelectStore,
  onRefreshStores,
  storeVersion
}: { 
  currentStore: any, 
  stores: any[], 
  loading: boolean, 
  onSelectStore: (store: any) => void,
  onRefreshStores: () => void,
  storeVersion: number
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const toggleDropdown = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);
  
  const selectStore = useCallback((store: any) => {
    onSelectStore(store);
    setIsOpen(false);
  }, [onSelectStore]);

  const handleRefresh = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRefreshStores();
  }, [onRefreshStores]);
  
  return (
    <div className="relative">
      <button 
        className="flex items-center px-2 md:px-4 py-2 hover:bg-white/10 transition-all duration-200 rounded-lg bg-white/5 border border-white/10" 
        onClick={toggleDropdown}
      >
        <Folder className="h-5 w-5 mr-2" />
        <span className="text-white whitespace-nowrap mr-2 font-medium hidden md:inline-block" suppressHydrationWarning>
          {loading ? 'Đang tải...' : (currentStore?.name ? currentStore.name : 'Chọn cửa hàng')}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 hidden md:block ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Store dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 md:left-0 md:right-auto top-full mt-2 w-64 md:w-72 bg-white rounded-xl shadow-xl border border-gray-100 py-2 text-gray-700 z-50">
          {/* Refresh button */}
          <div className="px-4 py-3 border-b border-gray-100">
            <button
              onClick={handleRefresh}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors duration-150"
              disabled={loading}
            >
              <Settings className="h-4 w-4 mr-2" />
              <span className="font-medium">{loading ? 'Đang tải...' : 'Làm mới danh sách'}</span>
            </button>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {stores.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {loading ? 'Đang tải cửa hàng...' : 'Không có cửa hàng nào'}
              </div>
            ) : (
              stores.map(store => (
                <button
                  key={store.id}
                  className={`block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors duration-150 mx-2 rounded-lg ${
                    currentStore?.id === store.id ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => selectStore(store)}
                >
                  <div className="font-medium">{store.name}</div>
                  {currentStore?.id === store.id && (
                    <div className="text-xs text-blue-600 mt-1">Đang chọn</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

StoreDropdown.displayName = 'StoreDropdown';

export function TopNavbar() {
  const isNuvorasBuild = getIsNuvorasBuild();
  // This state will be replaced with data from your backend API
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
    storeInvoices: 0,
    appointments: 0,
    pawnInvoices: 0,
    loanInvoices: 0,
    installmentInvoices: 0
  });
  
  // Thêm state để theo dõi phiên bản cửa hàng, dùng để buộc StoreDropdown re-render
  const [storeVersion, setStoreVersion] = useState(0);
  
  // Use the store context instead of local state
  const { currentStore, stores, setCurrentStore, loading, refreshStores, resetStores } = useStore();
  const router = useRouter();
  
  // Use permissions hook to check user permissions
  const { hasPermission } = usePermissions();
  
  // Use Auth context to get user information
  const { user } = useAuth();
  
  // Handler for store selection - memoized to prevent recreating on every render
  const handleStoreChange = useCallback((store: any) => {
    setCurrentStore(store);
    
    // Tăng phiên bản cửa hàng để buộc component re-render
    setStoreVersion(prev => prev + 1);
    
    // Buộc router refresh để làm mới dữ liệu trang
    router.refresh();
  }, [setCurrentStore, router]);
  
  // Log when component mounts and when current store changes
  useEffect(() => {
    if (currentStore) {
      
      // Replace with your actual API call to get notifications for the selected store
      const fetchNotificationsForStore = async () => {
        const endFetchNotifications = startPerfTimer('TopNavbar.fetchNotificationsForStore', {
          context: { storeId: currentStore.id },
        });
        try {
          // Initialize counts with zeros
          let overdueInstallments = 0;
          let pawnWarningsCount = 0;
          let creditWarningsCount = 0;
          
          // Only fetch installment warnings if user has permission
          if (isNuvorasBuild && hasPermission('xem_danh_sach_hop_dong_tra_gop')) {
            const endInstallmentWarnings = startPerfTimer('TopNavbar.fetchNotificationsForStore.countInstallmentWarnings');
            const { count, error } = await countInstallmentWarnings(currentStore.id);
            endInstallmentWarnings();
            if (error) {
              console.error('Error fetching overdue installments count:', error);
            } else {
              overdueInstallments = count;
            }
          }
          
          // Only fetch pawn warnings if user has permission
          if (hasPermission('xem_danh_sach_hop_dong_cam_do')) {
            const endPawnWarnings = startPerfTimer('TopNavbar.fetchNotificationsForStore.countPawnWarnings');
            const { count, error } = await countPawnWarnings(currentStore.id);
            endPawnWarnings();
            if (error) {
              console.error('Error fetching pawn warnings count:', error);
            } else {
              pawnWarningsCount = count;
            }
          }
          
          // Only fetch credit warnings if user has permission
          if (isNuvorasBuild && hasPermission('xem_danh_sach_hop_dong_tin_chap')) {
            const endCreditWarnings = startPerfTimer('TopNavbar.fetchNotificationsForStore.countCreditWarnings');
            const { count, error } = await countCreditWarnings(currentStore.id);
            endCreditWarnings();
            if (error) {
              console.error('Error fetching credit warnings count:', error);
            } else {
              creditWarningsCount = count;
            }
          }
          
          // Update notification counts
          const mockData = {
            storeInvoices: 0,
            appointments: 0,
            pawnInvoices: pawnWarningsCount,
            loanInvoices: creditWarningsCount,
            installmentInvoices: overdueInstallments
          };
          
          setNotificationCounts(mockData);
        } catch (error) {
          console.error('Error fetching notifications', error);
        } finally {
          endFetchNotifications();
        }
      };
      
      fetchNotificationsForStore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore, storeVersion]); // Removed hasPermission from dependencies
  
  // Helper function to render notification badge
  const renderNotificationBadge = (count: number) => {
    if (count > 0) {
      return (
        <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full shadow-lg border-2 border-white font-semibold">
          {count}
        </span>
      );
    }
    return null;
  };
  
  // User profile dropdown
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const toggleProfileDropdown = useCallback(() => {
    setIsProfileOpen(prev => !prev);
  }, []);

  // Close profile dropdown when clicking outside
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
      setIsProfileOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen, handleClickOutside]);

  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-[#4d7496] to-[#5a8bb0] text-white z-50 flex items-center justify-between px-6 shadow-lg border-b border-[#3a5a75]">
      {/* Left section with logo and settings icons */}
      <div className="flex items-center space-x-6">
        {/* Logo section */}
        <Link href="/dashboard" className="flex items-center group">
          <div className="h-10 w-10 rounded-lg bg-white text-[#4d7496] flex items-center justify-center font-bold text-lg shadow-md group-hover:shadow-lg transition-all duration-200">
            CR
          </div>
          <span className="ml-2 font-semibold text-lg tracking-wide hidden sm:inline-block">Quản lý Credit</span>
        </Link>


      </div>

      {/* Right section with various icons */}
      <div className="flex items-center space-x-2">
        {/* Notification icons group */}
        <div className="flex items-center space-x-1 bg-white/5 rounded-xl px-1 sm:px-2 py-1 overflow-x-auto">
          <div 
            className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
            title="Danh sách khách hàng bị báo xấu"
          >
            <button 
              className="flex items-center justify-center"
              onClick={() => router.push('/blacklisted-customers')}
            >
              <User className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
            </button>
          </div>
          <div 
            className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
            title={`Cầm đồ có ${notificationCounts.pawnInvoices} hóa đơn cần xử lý`}
          >
            <button 
              className="flex items-center justify-center"
              onClick={() => router.push('/pawn-warnings')}
            >
              <Bike className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
              {renderNotificationBadge(notificationCounts.pawnInvoices)}
            </button>
          </div>
          {isNuvorasBuild && (
            <div 
              className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
              title={`${getNavDisplayLabel('credits')} có ${notificationCounts.loanInvoices} hóa đơn cần xử lý`}
            >
              <button 
                className="flex items-center justify-center"
                onClick={() => router.push('/credit-warnings')}
              >
                <DollarSign className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
                {renderNotificationBadge(notificationCounts.loanInvoices)}
              </button>
            </div>
          )}
          {isNuvorasBuild && (
            <div 
              className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
              title={`Trả góp có ${notificationCounts.installmentInvoices} hợp đồng cần xử lý`}
            >
              <button 
                className="flex items-center justify-center"
                onClick={() => router.push('/installment-warnings')}
              >
                <Salad className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
                {renderNotificationBadge(notificationCounts.installmentInvoices)}
              </button>
            </div>
          )}
        </div>
        
        {/* Memomized Store Dropdown Component với storeVersion để buộc re-render */}
        <StoreDropdown
          currentStore={currentStore}
          stores={stores}
          loading={loading}
          onSelectStore={handleStoreChange}
          onRefreshStores={refreshStores}
          storeVersion={storeVersion}
        />
        
        {/* User profile with dropdown - click to toggle */}
        <div className="relative ml-2" ref={profileRef}>
          <button
            onClick={toggleProfileDropdown}
            className="flex items-center space-x-2 p-2 hover:bg-white/10 transition-all duration-200 rounded-lg relative"
          >
            <Avatar className="h-9 w-9 bg-gradient-to-br from-[#729bbe] to-[#5a8bb0] ring-2 ring-white/20">
              <AvatarFallback className="bg-gradient-to-br from-[#3a5a75] to-[#4d7496] text-white font-semibold">
                {user?.username?.charAt(0).toUpperCase() || 'N/A'}
              </AvatarFallback>
            </Avatar>
            <span className="ml-1 hidden md:inline-block font-medium">{user?.username || 'N/A'}</span>
            <ChevronDown className={`h-4 w-4 hidden md:block transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>
          {isProfileOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-2 text-gray-700 z-50">
              <Link href="/profile" className="block px-4 py-3 text-sm hover:bg-gray-50 flex items-center rounded-lg mx-2 transition-colors duration-150">
                <User className="h-4 w-4 mr-3 text-gray-500" />
                <span className="font-medium">Hồ sơ cá nhân</span>
              </Link>
              <div className="border-t border-gray-100 my-2"></div>
              <button 
                onClick={async () => {
                  try {
                    resetStores();
                    const { signOut } = await import('@/lib/auth');
                    await signOut();
                    // Let AuthContext handle redirect automatically via SIGNED_OUT event
                  } catch (e) {
                    console.error('Lỗi khi đăng xuất:', e);
                  }
                }}
                className="block w-full text-left px-4 py-3 text-sm hover:bg-red-50 flex items-center text-red-600 rounded-lg mx-2 transition-colors duration-150"
              >
                <LogOut className="h-4 w-4 mr-3" />
                <span className="font-medium">Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}