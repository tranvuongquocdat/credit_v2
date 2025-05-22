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


// Try to get store from localStorage on initialization for faster loading
const getInitialStoreFromLocalStorage = (): Store | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const savedStore = localStorage.getItem('selectedStore');
    if (savedStore) {
      const parsedStore = JSON.parse(savedStore) as Store;
      return parsedStore;
    }
  } catch (err) {
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
  
  // Try to load from localStorage immediately for faster initial render
  const [currentStore, setCurrentStoreState] = useState<Store | null>(getInitialStoreFromLocalStorage());
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to set current store and save to localStorage
  const setCurrentStore = (store: Store) => {
    
    // Use try-catch for localStorage operations as they can fail
    try {
      localStorage.setItem('selectedStore', JSON.stringify(store));
    } catch (err) {
    }
  };

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
          
          // We already tried to load from localStorage in the initial state
          // Now we just need to verify it exists in the fetched stores
          if (currentStore) {
            // Verify the store still exists in the list
            const storeExists = data.some(store => store.id === currentStore.id);
            
            if (!storeExists) {
              setCurrentStore(data[0]);
            }
          } else {
            // No store loaded yet, select the first one
            setCurrentStore(data[0]);
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
  }, [currentStore]);

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
