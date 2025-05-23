"use client";

import { Settings, Lock, User, Clock, Bike, DollarSign, Salad, Folder, ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect, memo, useCallback } from "react";
import { useStore } from "@/contexts/StoreContext";
import { useRouter } from "next/navigation";

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
  storeVersion
}: { 
  currentStore: any, 
  stores: any[], 
  loading: boolean, 
  onSelectStore: (store: any) => void,
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
  
  return (
    <div className="relative">
      <button 
        className="flex items-center px-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)]" 
        onClick={toggleDropdown}
      >
        <Folder className="h-6 w-6 mr-1" />
        <span className="text-white whitespace-nowrap mr-1">
          {loading ? 'Đang tải...' : (currentStore ? currentStore.name : 'Chọn cửa hàng')}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>
      
      {/* Store dropdown menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-md shadow-lg py-1 text-gray-700 z-50">
          {stores.map(store => (
            <button
              key={store.id}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${currentStore?.id === store.id ? 'bg-gray-100 font-medium' : ''}`}
              onClick={() => selectStore(store)}
            >
              <div className="font-medium">{store.name}</div>
            </button>
          ))}
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
  const { currentStore, stores, setCurrentStore, loading } = useStore();
  const router = useRouter();
  
  // Handler for store selection - memoized to prevent recreating on every render
  const handleStoreChange = useCallback((store: any) => {
    console.log('handleStoreChange', store);
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
        try {
          // Simulate different notification counts based on store ID to demonstrate it works
          const storeIdNum = parseInt(currentStore.id) || 0;
          const mockData = {
            storeInvoices: 2 + storeIdNum,
            appointments: 3 + storeIdNum,
            pawnInvoices: 4 + storeIdNum,
            loanInvoices: 6 + storeIdNum,
            installmentInvoices: 9 + storeIdNum
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
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      );
    }
    return null;
  };
  
  return (
    <div className="fixed top-0 left-0 right-0 h-14 bg-[#4d7496] text-white z-50 flex items-center justify-between px-4 shadow-md">
      {/* Left section with logo and settings icons */}
      <div className="flex items-center space-x-4">
        {/* Logo section */}
        <Link href="/" className="flex items-center mr-6">
          <div className="h-8 w-8 rounded bg-white text-[#4d7496] flex items-center justify-center font-bold">CR</div>
          <span className="ml-2 font-medium">Quản lý Credit</span>
        </Link>
        
        {/* Left side icons group */}
        <div className="flex items-center space-x-1">
          <button 
            className="p-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative" 
            title={`Cửa hàng có tổng ${notificationCounts.storeInvoices} hóa đơn cần xử lý`}
          >
            <Settings className="h-6 w-6" />
            {renderNotificationBadge(notificationCounts.storeInvoices)}
          </button>
          <button className="p-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative" title="Cài đặt khóa">
            <Lock className="h-6 w-6" />
          </button>
          <button className="p-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative" title="Danh sách khách hàng bị báo xấu">
            <User className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Right section with various icons */}
      <div className="flex items-center space-x-2">
        {/* Right side icons group */}
        <button 
          className="p-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative" 
          title={`Có ${notificationCounts.appointments} hồ sơ đang hẹn`}
        >
          <Clock className="h-6 w-6" />
          {renderNotificationBadge(notificationCounts.appointments)}
        </button>
        <button 
          className="p-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative" 
          title={`Cầm đồ có ${notificationCounts.pawnInvoices} hóa đơn cần xử lý`}
        >
          <Bike className="h-6 w-6" />
          {renderNotificationBadge(notificationCounts.pawnInvoices)}
        </button>
        <button 
          className="p-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative" 
          title={`Tín chấp có ${notificationCounts.loanInvoices} hóa đơn cần xử lý`}
        >
          <DollarSign className="h-6 w-6" />
          {renderNotificationBadge(notificationCounts.loanInvoices)}
        </button>
        <button 
          className="p-2 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative" 
          title={`Trả góp có ${notificationCounts.installmentInvoices} hóa đơn cần xử lý`}
          onClick={() => router.push('/installment-warnings')}
        >
          <Salad className="h-6 w-6" />
          {renderNotificationBadge(notificationCounts.installmentInvoices)}
        </button>
        
        {/* Memomized Store Dropdown Component với storeVersion để buộc re-render */}
        <StoreDropdown
          currentStore={currentStore}
          stores={stores}
          loading={loading}
          onSelectStore={handleStoreChange}
          storeVersion={storeVersion}
        />
        
        {/* User profile with dropdown */}
        <div className="relative group ml-2">
          <button className="flex items-center space-x-1 p-1 hover:bg-[#3a5a75] transition-colors border-l border-r border-[rgba(0,0,0,0.2)] relative">
            <Avatar className="h-8 w-8 bg-[#729bbe]">
              <AvatarFallback className="bg-[#3a5a75] text-white">AD</AvatarFallback>
            </Avatar>
            <span className="ml-1 hidden md:inline-block">Admin</span>
            <ChevronDown className="h-4 w-4 hidden md:block" />
          </button>
          
          {/* Dropdown menu */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg py-1 text-gray-700 invisible group-hover:visible transform opacity-0 group-hover:opacity-100 transition-all duration-200 z-50">
            <Link href="/profile" className="block px-4 py-2 text-sm hover:bg-gray-100 flex items-center">
              <User className="h-4 w-4 mr-2" />
              Hồ sơ cá nhân
            </Link>
            <Link href="/settings" className="block px-4 py-2 text-sm hover:bg-gray-100 flex items-center">
              <Settings className="h-4 w-4 mr-2" />
              Cài đặt tài khoản
            </Link>
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
              className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center text-red-600"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
