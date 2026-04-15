"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { Store } from '@/models/store';
import { getAllActiveStores } from '@/lib/store';
import { useAuth } from '@/contexts/AuthContext';

// Helper: lấy store đã lưu ngay khi component khởi tạo (client-side only)
const getInitialStore = (): Store | null => {
  if (typeof window === 'undefined') return null; // SSR an toàn
  try {
    const savedId = localStorage.getItem('currentStoreId');
    return savedId ? ({ id: savedId, name: '' } as Store) : null;
  } catch (err) {
    console.warn('Could not access localStorage:', err);
    return null;
  }
};

// Define the context shape
interface StoreContextType {
  currentStore: Store | null;
  stores: Store[];
  setCurrentStore: (store: Store) => void;
  loading: boolean;
  error: Error | null;
  refreshStores: () => Promise<void>;
  resetStores: () => void;
}

// Create the context with default values
const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Custom hook to use the store context
export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};

interface StoreProviderProps {
  children: ReactNode;
}

export const StoreProvider = ({ children }: StoreProviderProps) => {

  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStoreState] = useState<Store | null>(() => getInitialStore());
  const [loading, setLoading] = useState<boolean>(() => !getInitialStore());
  const [error, setError] = useState<Error | null>(null);
  const { user, loading: authLoading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  // Function to fetch stores
  const fetchStores = async () => {
    try {
      const { data, error } = await getAllActiveStores();
      
      if (error) {
        console.error('❌ Error fetching stores:', error);
        throw new Error(typeof error === 'object' && error && 'message' in error ? error.message as string : 'Failed to fetch stores');
      }
      
      
      if (data && data.length > 0) {
        setStores(data);
        
        // Lấy store đã chọn từ localStorage nếu có
        const savedStoreId = localStorage.getItem('currentStoreId');
        
        if (savedStoreId) {
          const savedStore = data.find(store => store.id === savedStoreId);
          if (savedStore) {
            setCurrentStoreState(savedStore);
          } else {
            // Nếu không tìm thấy store đã lưu, mặc định chọn store đầu tiên
            setCurrentStoreState(data[0]);
            localStorage.setItem('currentStoreId', data[0].id);
          }
        } else {
          // Nếu không có store nào được lưu, mặc định chọn store đầu tiên
          setCurrentStoreState(data[0]);
          localStorage.setItem('currentStoreId', data[0].id);
        }
      } else {
        setStores([]);
        setCurrentStoreState(null);
        // Xóa store đã lưu trong localStorage vì không còn hợp lệ
        localStorage.removeItem('currentStoreId');
      }
      
      setError(null);
    } catch (err) {
      console.error('❌ Failed to fetch stores:', err);
    }
  };

  const resetStores = () => {
    setStores([]);
    setCurrentStoreState(null);
    localStorage.removeItem('currentStoreId');
  };

  // Re-fetch stores khi user thay đổi (login/logout/switch account)
  useEffect(() => {
    if (authLoading) return;

    const currentUserId = user?.id ?? null;
    if (currentUserId === prevUserIdRef.current) return;
    prevUserIdRef.current = currentUserId;

    if (!currentUserId) {
      // User vừa logout → reset stores
      resetStores();
    } else {
      // User vừa login hoặc đổi account → fetch lại stores
      const initializeStores = async () => {
        if (!currentStore) setLoading(true);
        await fetchStores();
        setLoading(false);
      };
      initializeStores();
    }
  }, [user?.id, authLoading]);

  // Cross-tab sync: cập nhật khi key thay đổi ở tab khác
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'currentStoreId' && e.newValue) {
        const newStore = stores.find((s) => s.id === e.newValue);
        if (newStore) setCurrentStoreState(newStore);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [stores]);

  // Function to refresh stores (can be called manually)
  const refreshStores = async () => {
    setLoading(true);
    await fetchStores();
    setLoading(false);
  };

  // Hàm để cập nhật currentStore
  const setCurrentStore = (store: Store) => {
    
    // Lưu vào state (quan trọng để trigger re-render)
    setCurrentStoreState(store);
    
    // Lưu vào localStorage
    localStorage.setItem('currentStoreId', store.id);
    
  };

  // Use useMemo to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    currentStore,
    stores,
    setCurrentStore,
    loading,
    error,
    refreshStores,
    resetStores
  }), [currentStore, stores, loading, error]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};