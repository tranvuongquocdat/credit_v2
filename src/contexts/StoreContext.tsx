"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
const StoreContext = createContext<StoreContextType>({
  currentStore: null,
  stores: [],
  setCurrentStore: () => {},
  loading: true,
  error: null
});

// Custom hook to use the store context
export const useStore = () => useContext(StoreContext);

interface StoreProviderProps {
  children: ReactNode;
}

export const StoreProvider = ({ children }: StoreProviderProps) => {
  const [currentStore, setCurrentStoreState] = useState<Store | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to set current store and save to localStorage
  const setCurrentStore = (store: Store) => {
    setCurrentStoreState(store);
    localStorage.setItem('selectedStore', JSON.stringify(store));
  };

  // Load stores and initialize current store
  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        const { data, error } = await getAllActiveStores();
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data && data.length > 0) {
          setStores(data);
          
          // Try to get previously selected store from localStorage
          const savedStore = localStorage.getItem('selectedStore');
          
          if (savedStore) {
            const parsedStore = JSON.parse(savedStore) as Store;
            
            // Verify the store still exists in the list
            const storeExists = data.some(store => store.id === parsedStore.id);
            
            if (storeExists) {
              setCurrentStoreState(parsedStore);
            } else {
              // If saved store no longer exists, select the first store
              setCurrentStore(data[0]);
            }
          } else {
            // No saved store, select the first one
            setCurrentStore(data[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching stores:', err);
        setError(err instanceof Error ? err : new Error('Unknown error occurred'));
      } finally {
        setLoading(false);
      }
    };
    
    fetchStores();
  }, []);

  return (
    <StoreContext.Provider value={{ currentStore, stores, setCurrentStore, loading, error }}>
      {children}
    </StoreContext.Provider>
  );
};
