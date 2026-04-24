// DEPRECATED sau PR3: cash_fund không còn là state nữa, fund luôn event-sourced
// từ history qua RPC calc_cash_fund_as_of. Hook này giữ lại dưới dạng no-op để
// các callers (capital/page.tsx, installments/page.tsx) không phải sửa ngay.
// Có thể gỡ hoàn toàn trong PR dọn code sau.
import { useStore } from '@/contexts/StoreContext';

interface UseCashFundUpdaterOptions {
  enabled?: boolean;
  onUpdate?: (newCashFund: number) => void;
  onError?: (error: string | Error) => void;
}

export function useCashFundUpdater(_options: UseCashFundUpdaterOptions = {}) {
  const { currentStore } = useStore();
  const updateCashFund = async () => {
    // no-op
  };
  return { updateCashFund, storeId: currentStore?.id };
}

export function useAutoUpdateCashFund(options: UseCashFundUpdaterOptions = {}) {
  const { updateCashFund } = useCashFundUpdater(options);
  const triggerUpdate = async (_delay: number = 500) => {
    // no-op
  };
  return { triggerUpdate, updateCashFund };
}
