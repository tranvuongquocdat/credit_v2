import { RefreshCw, StoreIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getStoreFinancialData, StoreFinancialData } from '@/lib/store';
import { useStore } from '@/contexts/StoreContext';

interface FinancialSummaryProps {
  fundStatus?: StoreFinancialData; // Optional: cho phép truyền từ ngoài vào
  onRefresh?: () => void;          // Optional: cho phép truyền từ ngoài vào
  storeId?: string;                // ID của cửa hàng (nếu không truyền, lấy từ context)
  autoFetch?: boolean;             // Có tự động lấy dữ liệu không (mặc định là true)
}

export function FinancialSummary({ 
  fundStatus: externalFundStatus, 
  onRefresh: externalOnRefresh,
  storeId,
  autoFetch = true
}: FinancialSummaryProps) {
  // Get current store from context
  const { currentStore } = useStore();
  
  // Use storeId from props if provided, otherwise use it from context
  const currentStoreId = storeId || currentStore?.id || '1';
  
  // State nội bộ khi không có dữ liệu từ ngoài vào
  const [internalFundStatus, setInternalFundStatus] = useState<StoreFinancialData | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Hàm fetch dữ liệu
  const fetchData = async () => {
    if (externalFundStatus) return; // Không fetch nếu đã có dữ liệu từ props
    
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
  
  // Gọi API khi component mount hoặc storeId thay đổi
  useEffect(() => {
    if (autoFetch && !externalFundStatus) {
      fetchData();
    }
  }, [currentStoreId, autoFetch, externalFundStatus]);
  
  // Sử dụng dữ liệu từ props nếu có, nếu không thì dùng state nội bộ
  const fundStatus = externalFundStatus || internalFundStatus;
  console.log("Fund Status", fundStatus);
  // Sử dụng callback từ props nếu có, nếu không thì dùng hàm fetch nội bộ
  const onRefresh = () => {
    if (externalOnRefresh) {
      externalOnRefresh();
    } else {
      fetchData();
    }
  };
  
  // Hiển thị skeleton khi đang tải dữ liệu
  if (loading || !fundStatus) {
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
      <div className="flex py-1">
        <div className="flex-1 text-center px-2">
          <div className="flex items-center justify-center text-gray-500 text-sm mb-1">
            <span>Quỹ tiền mặt</span>
            <RefreshCw 
              className="ml-1 h-3.5 w-3.5 cursor-pointer hover:text-blue-500" 
              onClick={onRefresh}
            />
          </div>
          <div className="text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.availableFund).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-2"></div>
        
        <div className="flex-1 text-center px-2">
          <div className="text-gray-500 text-sm mb-1">
            <span>Tiền cho vay</span>
          </div>
          <div className="text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.totalLoan).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-2"></div>
        
        <div className="flex-1 text-center px-2">
          <div className="text-gray-500 text-sm mb-1">
            <span>Tiền nợ</span>
          </div>
          <div className="text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.oldDebt).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-2"></div>
        
        <div className="flex-1 text-center px-2">
          <div className="text-gray-500 text-sm mb-1">
            <span>Lãi phí dự kiến</span>
          </div>
          <div className="text-base font-semibold text-gray-800">
            {Math.floor(fundStatus.profit).toLocaleString()}
          </div>
        </div>
        
        <div className="w-px bg-gray-200 mx-2"></div>
        
        <div className="flex-1 text-center px-2">
          <div className="text-gray-500 text-sm mb-1">
            <span>Lãi phí đã thu</span>
          </div>
          <div className="text-base font-semibold text-gray-800">
            {Math.floor((fundStatus.collectedInterest)).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
