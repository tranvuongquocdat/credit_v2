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

// Debug helper function
const debugLog = (message: string, data?: any) => {
  console.log(`[StoreContext] ${message}`, data ? data : '');
};

// Try to get store from localStorage on initialization for faster loading
const getInitialStoreFromLocalStorage = (): Store | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const savedStore = localStorage.getItem('selectedStore');
    if (savedStore) {
      const parsedStore = JSON.parse(savedStore) as Store;
      debugLog('Pre-loaded store from localStorage:', parsedStore.name);
      return parsedStore;
    }
  } catch (err) {
    debugLog('Error pre-loading from localStorage:', err);
  }
  
  return null;
};

// Create the context with default values
const StoreContext = createContext<StoreContextType>({
  currentStore: null,
  stores: [],
  setCurrentStore: () => {},
  loading: true,
  error: null
});

// Custom hook to use the store context
export const useStore = () => {
  const context = useContext(StoreContext);
  return context;
};

interface StoreProviderProps {
  children: ReactNode;
}

export const StoreProvider = ({ children }: StoreProviderProps) => {
  debugLog('StoreProvider rendering');
  
  // Try to load from localStorage immediately for faster initial render
  const [currentStore, setCurrentStoreState] = useState<Store | null>(getInitialStoreFromLocalStorage());
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to set current store and save to localStorage
  const setCurrentStore = (store: Store) => {
    debugLog(`Setting current store: ${store.name} (${store.id})`);
    setCurrentStoreState(store);
    
    // Use try-catch for localStorage operations as they can fail
    try {
      localStorage.setItem('selectedStore', JSON.stringify(store));
    } catch (err) {
      debugLog('Error saving to localStorage:', err);
    }
  };

  // Load stores and verify/initialize current store
  useEffect(() => {
    let isMounted = true;
    debugLog('Initializing StoreProvider - fetching stores');
    
    const fetchStores = async () => {
      try {
        const { data, error } = await getAllActiveStores();
        
        // Check if component is still mounted before updating state
        if (!isMounted) return;
        
        if (error) {
          debugLog('Error fetching stores:', error);
          throw new Error(error.message);
        }
        
        if (data && data.length > 0) {
          debugLog(`Fetched ${data.length} stores`);
          setStores(data);
          
          // We already tried to load from localStorage in the initial state
          // Now we just need to verify it exists in the fetched stores
          if (currentStore) {
            // Verify the store still exists in the list
            const storeExists = data.some(store => store.id === currentStore.id);
            
            if (!storeExists) {
              debugLog('Pre-loaded store no longer exists, selecting first store');
              setCurrentStore(data[0]);
            }
          } else {
            // No store loaded yet, select the first one
            debugLog('No store loaded, selecting first store');
            setCurrentStore(data[0]);
          }
        } else {
          debugLog('No stores found or empty data array');
        }
      } catch (err) {
        if (!isMounted) return;
        
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        debugLog(`Error in store initialization: ${errorMessage}`);
        setError(err instanceof Error ? err : new Error('Unknown error occurred'));
      } finally {
        if (isMounted) {
          setLoading(false);
          debugLog('Store initialization completed');
        }
      }
    };
    
    fetchStores();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [currentStore]);

  // Use useMemo to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    currentStore,
    stores,
    setCurrentStore,
    loading,
    error
  }), [currentStore, stores, loading, error]);

  debugLog('StoreProvider state:', { 
    currentStore: currentStore?.name, 
    storeId: currentStore?.id,
    storesCount: stores.length,
    loading
  });

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};
