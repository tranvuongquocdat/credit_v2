import { useEffect } from 'react';
import { updateCashFundFromAllSources } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';

interface UseCashFundUpdaterOptions {
  enabled?: boolean;
  onUpdate?: (newCashFund: number) => void;
  onError?: (error: string | Error) => void;
}

export function useCashFundUpdater(options: UseCashFundUpdaterOptions = {}) {
  const { currentStore } = useStore();
  const { enabled = true, onUpdate, onError } = options;

  const updateCashFund = async () => {
    if (!enabled || !currentStore?.id) return;

    try {
      const result = await updateCashFundFromAllSources(currentStore.id);
      
      if (result.success && result.newCashFund !== undefined) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Cash fund updated successfully:', result.newCashFund);
        }
        onUpdate?.(result.newCashFund);
      } else {
        console.error('Error updating cash fund:', result.error);
        onError?.(result.error instanceof Error ? result.error : new Error(String(result.error)));
      }
    } catch (error) {
      console.error('Error updating cash fund from all sources:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return {
    updateCashFund,
    storeId: currentStore?.id
  };
}

// Hook để tự động cập nhật cash_fund sau khi thực hiện các thao tác CRUD
export function useAutoUpdateCashFund(options: UseCashFundUpdaterOptions = {}) {
  const { updateCashFund } = useCashFundUpdater(options);

  // Hàm wrapper để gọi sau khi thực hiện CRUD operations
  const triggerUpdate = async (delay: number = 1000) => {
    // Delay một chút để đảm bảo transaction đã được commit
    setTimeout(() => {
      updateCashFund();
    }, delay);
  };

  return {
    triggerUpdate,
    updateCashFund
  };
} 