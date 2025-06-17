"use client";

import { Settings, Lock, User, Clock, Package, CreditCard, Calendar, Folder, ChevronDown, LogOut, Bell } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect, memo, useCallback } from "react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";
import { countInstallmentWarnings } from "@/lib/installmentPayment";
import { countPawnWarnings } from "@/lib/pawn-warnings";
import { countCreditWarnings } from "@/lib/credit-warnings";
import { getCurrentUser } from "@/lib/auth";

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
        className="flex items-center px-4 py-2 hover:bg-white/10 transition-all duration-200 rounded-lg bg-white/5 border border-white/10" 
        onClick={toggleDropdown}
      >
        <Folder className="h-5 w-5 mr-2" />
        <span className="text-white whitespace-nowrap mr-2 font-medium">
          {loading ? 'Đang tải...' : (currentStore ? currentStore.name : 'Chọn cửa hàng')}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Store dropdown menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 py-2 text-gray-700 z-50">
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
  const { currentStore, stores, setCurrentStore, loading, refreshStores } = useStore();
  const router = useRouter();
  
  // State để theo dõi lần đầu component mount
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // Handler for store selection - memoized to prevent recreating on every render
  const handleStoreChange = useCallback((store: any) => {
    console.log('handleStoreChange', store);
    setCurrentStore(store);
    
    // Tăng phiên bản cửa hàng để buộc component re-render
    setStoreVersion(prev => prev + 1);
    
    // Buộc router refresh để làm mới dữ liệu trang
    router.refresh();
  }, [setCurrentStore, router]);
  const [user, setUser] = useState<any>(null);
  useEffect(() => { 
    const fetchUser = async () => {
      const user = await getCurrentUser();
      setUser(user);
    };
    fetchUser();
  }, []);
  // Auto refresh stores khi component mount lần đầu (sau khi login)
  useEffect(() => {
    if (!hasInitialized) {
      console.log('TopNavbar: Auto refreshing stores on first mount');
      refreshStores();
      setHasInitialized(true);
    }
  }, [hasInitialized, refreshStores]);
  
  // Log when component mounts and when current store changes
  useEffect(() => {
    if (currentStore) {
      
      // Replace with your actual API call to get notifications for the selected store
      const fetchNotificationsForStore = async () => {
        try {
          // Get real count of overdue installments
          const { count: overdueInstallments, error: installmentError } = await countInstallmentWarnings(currentStore.id);
          console.log('overdueInstallments', overdueInstallments);
          if (installmentError) {
            console.error('Error fetching overdue installments count:', installmentError);
          }
          
          // Get real count of pawn warnings
          const { count: pawnWarningsCount, error: pawnError } = await countPawnWarnings(currentStore.id);
          console.log('pawnWarningsCount', pawnWarningsCount);
          if (pawnError) {
            console.error('Error fetching pawn warnings count:', pawnError);
          }
          
          // Get real count of credit warnings
          const { count: creditWarningsCount, error: creditError } = await countCreditWarnings(currentStore.id);
          console.log('creditWarningsCount', creditWarningsCount);
          if (creditError) {
            console.error('Error fetching credit warnings count:', creditError);
          }
          
          // Simulate different notification counts based on store ID to demonstrate it works
          const mockData = {
            storeInvoices: 0,
            appointments: 0,
            pawnInvoices: pawnError ? 0 : pawnWarningsCount, // Use real count if available
            loanInvoices: creditError ? 0 : creditWarningsCount, // Use real count if available
            installmentInvoices: installmentError ? 0 : overdueInstallments // Use real count if available
          };
          
          setNotificationCounts(mockData);
        } catch (error) {
          console.error('Error fetching notifications', error);
        }
      };
      
      fetchNotificationsForStore();
    }
  }, [currentStore, storeVersion]);
  
  // Helper function to render notification badge
  const renderNotificationBadge = (count: number) => {
    if (count > 0) {
      return (
        <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full shadow-lg border-2 border-white font-semibold">
          {count > 99 ? '99+' : count}
        </span>
      );
    }
    return null;
  };
  

  
  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-[#4d7496] to-[#5a8bb0] text-white z-50 flex items-center justify-between px-6 shadow-lg border-b border-[#3a5a75]">
      {/* Left section with logo and settings icons */}
      <div className="flex items-center space-x-6">
        {/* Logo section */}
        <Link href="/" className="flex items-center group">
          <div className="h-10 w-10 rounded-lg bg-white text-[#4d7496] flex items-center justify-center font-bold text-lg shadow-md group-hover:shadow-lg transition-all duration-200">
            CR
          </div>
          <span className="ml-3 font-semibold text-lg tracking-wide">Quản lý Credit</span>
        </Link>

        {/* Left side icons group */}
        <div className="flex items-center">
          <button 
            className="p-3 hover:bg-white/10 transition-all duration-200 rounded-lg relative group" 
            title={`Cửa hàng có tổng ${notificationCounts.storeInvoices} hóa đơn cần xử lý`}
          >
            <Settings className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
            {renderNotificationBadge(notificationCounts.storeInvoices)}
          </button>
          <button className="p-3 hover:bg-white/10 transition-all duration-200 rounded-lg relative group" title="Cài đặt khóa">
            <Lock className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
          </button>
          <button className="p-3 hover:bg-white/10 transition-all duration-200 rounded-lg relative group" title="Danh sách khách hàng bị báo xấu">
            <User className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
          </button>
        </div>
      </div>

      {/* Right section with various icons */}
      <div className="flex items-center space-x-2">
        {/* Notification icons group */}
        <div className="flex items-center space-x-1 bg-white/5 rounded-xl px-2 py-1">
          <button 
            className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
            title={`Có ${notificationCounts.appointments} hồ sơ đang hẹn`}
          >
            <Clock className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
            {renderNotificationBadge(notificationCounts.appointments)}
          </button>
          <button 
            className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
            title={`Cầm đồ có ${notificationCounts.pawnInvoices} hóa đơn cần xử lý`}
            onClick={() => router.push('/pawn-warnings')}
          >
            <Package className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
            {renderNotificationBadge(notificationCounts.pawnInvoices)}
          </button>
          <button 
            className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
            title={`Tín chấp có ${notificationCounts.loanInvoices} hóa đơn cần xử lý`}
            onClick={() => router.push('/credit-warnings')}
          >
            <CreditCard className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
            {renderNotificationBadge(notificationCounts.loanInvoices)}
          </button>
          <button 
            className="p-2.5 hover:bg-white/15 transition-all duration-200 rounded-lg relative group" 
            title={`Trả góp có ${notificationCounts.installmentInvoices} hợp đồng cần xử lý`}
            onClick={() => router.push('/installment-warnings')}
          >
            <Calendar className="h-5 w-5 group-hover:scale-110 transition-transform duration-200" />
            {renderNotificationBadge(notificationCounts.installmentInvoices)}
          </button>
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
        
        {/* User profile with dropdown */}
        <div className="relative group ml-2">
          <button className="flex items-center space-x-2 p-2 hover:bg-white/10 transition-all duration-200 rounded-lg relative">
            <Avatar className="h-9 w-9 bg-gradient-to-br from-[#729bbe] to-[#5a8bb0] ring-2 ring-white/20">
              <AvatarFallback className="bg-gradient-to-br from-[#3a5a75] to-[#4d7496] text-white font-semibold">
                {user?.username?.charAt(0).toUpperCase() || 'N/A'}
              </AvatarFallback>
            </Avatar>
            <span className="ml-1 hidden md:inline-block font-medium">{user?.username || 'N/A'}</span>
            <ChevronDown className="h-4 w-4 hidden md:block group-hover:rotate-180 transition-transform duration-200" />
          </button>
          
          {/* Dropdown menu */}
          <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-2 text-gray-700 invisible group-hover:visible transform opacity-0 group-hover:opacity-100 transition-all duration-200 z-50">
            <Link href="/profile" className="block px-4 py-3 text-sm hover:bg-gray-50 flex items-center rounded-lg mx-2 transition-colors duration-150">
              <User className="h-4 w-4 mr-3 text-gray-500" />
              <span className="font-medium">Hồ sơ cá nhân</span>
            </Link>
            <Link href="/settings" className="block px-4 py-3 text-sm hover:bg-gray-50 flex items-center rounded-lg mx-2 transition-colors duration-150">
              <Settings className="h-4 w-4 mr-3 text-gray-500" />
              <span className="font-medium">Cài đặt tài khoản</span>
            </Link>
            <div className="border-t border-gray-100 my-2"></div>
            <button 
              onClick={async () => {
                try {
                  const { signOut } = await import('@/lib/auth');
                  await signOut();
                  router.push('/login');
                  router.refresh();
                } catch (error) {
                  console.error('Lỗi khi đăng xuất:', error);
                }
              }}
              className="block w-full text-left px-4 py-3 text-sm hover:bg-red-50 flex items-center text-red-600 rounded-lg mx-2 transition-colors duration-150"
            >
              <LogOut className="h-4 w-4 mr-3" />
              <span className="font-medium">Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}