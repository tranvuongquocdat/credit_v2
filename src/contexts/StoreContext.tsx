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

  // Load stores and verify/initialize current store
  useEffect(() => {
    let isMounted = true;
    
    const fetchStores = async () => {
      try {
        const { data, error } = await getAllActiveStores();
        
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        if (error) {
          throw new Error(error.message);
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
        }
      } catch (err) {
        if (!isMounted) return;
        
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(err instanceof Error ? err : new Error('Unknown error occurred'));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    fetchStores();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, []);

  // Hàm để cập nhật currentStore
  const setCurrentStore = (store: Store) => {
    // Lưu vào state (quan trọng để trigger re-render)
    setCurrentStoreState(store);
    
    // Lưu vào localStorage
    localStorage.setItem('currentStoreId', store.id);
    
    console.log('Store context updated:', store);
  };

  // Use useMemo to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    currentStore,
    stores,
    setCurrentStore,
    loading,
    error
  }), [currentStore, stores, loading, error]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};
