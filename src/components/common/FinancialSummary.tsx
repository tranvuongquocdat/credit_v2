import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getStoreFinancialData, StoreFinancialData } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';

interface FinancialSummaryProps {
  fundStatus?: StoreFinancialData;
  onRefresh?: () => void;
  /** Khi parent đang fetch lại fundStatus (vd. React Query / hook), hiển thị skeleton */
  externalLoading?: boolean;
  storeId?: string;
  autoFetch?: boolean;
  /** @deprecated PR3 đã bỏ cash_fund state, fund luôn event-sourced. Prop này không còn tác dụng. */
  enableCashFundUpdate?: boolean;
}

export function FinancialSummary({
  fundStatus: externalFundStatus,
  onRefresh: externalOnRefresh,
  externalLoading = false,
  storeId,
  autoFetch = true,
}: FinancialSummaryProps) {
  const { currentStore } = useStore();
  const currentStoreId = storeId || currentStore?.id || '1';

  const [internalFundStatus, setInternalFundStatus] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (externalFundStatus) return;

    setLoading(true);
    try {
      const data = await getStoreFinancialData(currentStoreId);
      setInternalFundStatus(data);
    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch && !externalFundStatus) {
      fetchData();
    }
  }, [currentStoreId, autoFetch, externalFundStatus]);

  const fundStatus = externalFundStatus || internalFundStatus;

  const onRefresh = () => {
    if (externalOnRefresh) {
      externalOnRefresh();
    } else {
      fetchData();
    }
  };
  
  // Hiển thị skeleton khi đang tải dữ liệu (nội bộ hoặc từ parent khi refetch fundStatus)
  if (loading || externalLoading || !fundStatus) {
    return (
      <div className="mb-4 flex py-1 animate-pulse">
        {[1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="flex-1 text-center px-2">
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-6 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <div className="mb-4">
      {/* Desktop/Tablet view - all 5 columns */}
      <div className="hidden md:flex py-1">
        <div className="flex-1 text-center px-1 lg:px-2">
          <div className="flex items-center justify-center text-gray-500 text-xs lg:text-sm mb-1">
            <span>Quỹ tiền mặt</span>
            <RefreshCw 
              className={`ml-1 h-3 w-3 lg:h-3.5 lg:w-3.5 cursor-pointer hover:text-blue-500 ${loading ? 'animate-spin' : ''}`}
              onClick={onRefresh}
            />
          </div>
          <div className="text-sm lg:text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.availableFund).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-1 lg:mx-2"></div>
        
        <div className="flex-1 text-center px-1 lg:px-2">
          <div className="text-gray-500 text-xs lg:text-sm mb-1">
            <span>Tiền cho vay</span>
          </div>
          <div className="text-sm lg:text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.totalLoan).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-1 lg:mx-2"></div>
        
        <div className="flex-1 text-center px-1 lg:px-2">
          <div className="text-gray-500 text-xs lg:text-sm mb-1">
            <span>Tiền nợ</span>
          </div>
          <div className="text-sm lg:text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.oldDebt).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-1 lg:mx-2"></div>
        
        <div className="flex-1 text-center px-1 lg:px-2">
          <div className="text-gray-500 text-xs lg:text-sm mb-1">
            <span>Lãi phí dự kiến</span>
          </div>
          <div className="text-sm lg:text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.profit).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-1 lg:mx-2"></div>
        
        <div className="flex-1 text-center px-1 lg:px-2">
          <div className="text-gray-500 text-xs lg:text-sm mb-1">
            <span>Lãi phí đã thu</span>
          </div>
          <div className="text-sm lg:text-base font-semibold text-gray-800">
            {Math.floor((fundStatus.collectedInterest || 0)).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Mobile view - 2 rows with most important info */}
      <div className="md:hidden space-y-2">
        {/* First row - 3 main financial metrics */}
        <div className="flex py-1">
          <div className="flex-1 text-center px-1">
            <div className="flex items-center justify-center text-gray-500 text-xs mb-1">
              <span>Quỹ tiền mặt</span>
              <RefreshCw 
                className={`ml-1 h-3 w-3 cursor-pointer hover:text-blue-500 ${loading ? 'animate-spin' : ''}`}
                onClick={onRefresh}
              />
            </div>
            <div className="text-sm font-semibold text-gray-800">
              {Math.floor(fundStatus.availableFund).toLocaleString()}
            </div>
          </div>
          
          <div className="w-px bg-gray-200 mx-1"></div>
          
          <div className="flex-1 text-center px-1">
            <div className="text-gray-500 text-xs mb-1">
              <span>Tiền cho vay</span>
            </div>
            <div className="text-sm font-semibold text-gray-800">
              {Math.floor(fundStatus.totalLoan).toLocaleString()}
            </div>
          </div>
          
          <div className="w-px bg-gray-200 mx-1"></div>
          
          <div className="flex-1 text-center px-1">
            <div className="text-gray-500 text-xs mb-1">
              <span>Lãi phí dự kiến</span>
            </div>
            <div className="text-sm font-semibold text-gray-800">
              {Math.floor(fundStatus.profit).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Second row - 2 additional metrics */}
        <div className="flex py-1 border-t border-gray-100 pt-2">
          <div className="flex-1 text-center px-1">
            <div className="text-gray-500 text-xs mb-1">
              <span>Tiền nợ</span>
            </div>
            <div className="text-sm font-semibold text-gray-800">
              {Math.floor(fundStatus.oldDebt).toLocaleString()}
            </div>
          </div>
          
          <div className="w-px bg-gray-200 mx-1"></div>
          
          <div className="flex-1 text-center px-1">
            <div className="text-gray-500 text-xs mb-1">
              <span>Lãi phí đã thu</span>
            </div>
            <div className="text-sm font-semibold text-gray-800">
              {Math.floor((fundStatus.collectedInterest || 0)).toLocaleString()}
            </div>
          </div>
          
          {/* Empty space to balance the layout */}
          <div className="flex-1"></div>
        </div>
      </div>
    </div>
  );
}
