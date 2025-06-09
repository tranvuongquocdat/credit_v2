"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { Store } from '@/models/store';
import { getAllActiveStores } from '@/lib/store';

// Define the context shape
interface StoreContextType {
  currentStore: Store | null;
  stores: Store[];
  setCurrentStore: (store: Store) => void;
  loading: boolean;
  error: Error | null;
  refreshStores: () => Promise<void>;
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
  const [currentStore, setCurrentStoreState] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to fetch stores
  const fetchStores = async () => {
    try {
      console.log('🔄 Fetching stores...');
      const { data, error } = await getAllActiveStores();
      
      if (error) {
        console.error('❌ Error fetching stores:', error);
        throw new Error(typeof error === 'object' && error && 'message' in error ? error.message as string : 'Failed to fetch stores');
      }
      
      console.log('✅ Stores fetched successfully:', data?.length || 0, 'stores');
      
      if (data && data.length > 0) {
        setStores(data);
        
        // Lấy store đã chọn từ localStorage nếu có
        const savedStoreId = localStorage.getItem('currentStoreId');
        console.log('💾 Saved store ID from localStorage:', savedStoreId);
        
        if (savedStoreId) {
          const savedStore = data.find(store => store.id === savedStoreId);
          if (savedStore) {
            console.log('✅ Found saved store:', savedStore.name);
            setCurrentStoreState(savedStore);
          } else {
            console.log('⚠️ Saved store not found, using first store');
            // Nếu không tìm thấy store đã lưu, mặc định chọn store đầu tiên
            setCurrentStoreState(data[0]);
            localStorage.setItem('currentStoreId', data[0].id);
          }
        } else {
          console.log('📝 No saved store, using first store');
          // Nếu không có store nào được lưu, mặc định chọn store đầu tiên
          setCurrentStoreState(data[0]);
          localStorage.setItem('currentStoreId', data[0].id);
        }
      } else {
        console.log('⚠️ No stores available - user may not have access to any stores');
        setStores([]);
        setCurrentStoreState(null);
        // Xóa store đã lưu trong localStorage vì không còn hợp lệ
        localStorage.removeItem('currentStoreId');
      }
      
      setError(null);
    } catch (err) {
      console.error('❌ Failed to fetch stores:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(err instanceof Error ? err : new Error('Unknown error occurred'));
    }
  };

  // Load stores and verify/initialize current store
  useEffect(() => {
    let isMounted = true;
    
    const initializeStores = async () => {
      setLoading(true);
      await fetchStores();
      if (isMounted) {
        setLoading(false);
      }
    };
    
    initializeStores();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, []);

  // Function to refresh stores (can be called manually)
  const refreshStores = async () => {
    setLoading(true);
    await fetchStores();
    setLoading(false);
  };

  // Hàm để cập nhật currentStore
  const setCurrentStore = (store: Store) => {
    console.log('🔄 Setting current store:', store.name);
    
    // Lưu vào state (quan trọng để trigger re-render)
    setCurrentStoreState(store);
    
    // Lưu vào localStorage
    localStorage.setItem('currentStoreId', store.id);
    
    console.log('✅ Store context updated:', store.name);
  };

  // Use useMemo to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    currentStore,
    stores,
    setCurrentStore,
    loading,
    error,
    refreshStores
  }), [currentStore, stores, loading, error]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};
