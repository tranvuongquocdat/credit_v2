import { RefreshCw } from 'lucide-react';

interface FundStatus {
  totalFund: number;
  totalLoan: number;
  profit: number;
  availableFund: number;
  oldDebt: number;
  collectedInterest?: number;
}

interface FinancialSummaryProps {
  fundStatus: FundStatus;
  onRefresh: () => void;
}

export function FinancialSummary({ fundStatus, onRefresh }: FinancialSummaryProps) {
  return (
    <div className="mb-4 flex py-1">
      <div className="flex-1 text-center px-2">
        <div className="flex items-center justify-center text-gray-500 text-sm mb-1">
          <span>Quỹ tiền mặt</span>
          <RefreshCw 
            className="ml-1 h-3.5 w-3.5 cursor-pointer hover:text-blue-500" 
            onClick={onRefresh}
          />
        </div>
        <div className="text-base font-semibold text-gray-800">
          {Math.floor(fundStatus.totalFund / 1000).toLocaleString()}
        </div>
      </div>
      
      <div className="w-px bg-gray-200 mx-2"></div>
      
      <div className="flex-1 text-center px-2">
        <div className="text-gray-500 text-sm mb-1">
          <span>Tiền cho vay</span>
        </div>
        <div className="text-base font-semibold text-gray-800">
          {Math.floor(fundStatus.totalLoan / 1000).toLocaleString()}
        </div>
      </div>
      
      <div className="w-px bg-gray-200 mx-2"></div>
      
      <div className="flex-1 text-center px-2">
        <div className="text-gray-500 text-sm mb-1">
          <span>Tiền nợ</span>
        </div>
        <div className="text-base font-semibold text-gray-800">
          {Math.floor(fundStatus.oldDebt / 1000).toLocaleString()}
        </div>
      </div>
      
      <div className="w-px bg-gray-200 mx-2"></div>
      
      <div className="flex-1 text-center px-2">
        <div className="text-gray-500 text-sm mb-1">
          <span>Lãi phí dự kiến</span>
        </div>
        <div className="text-base font-semibold text-gray-800">
          {Math.floor(fundStatus.profit / 1000).toLocaleString()}
        </div>
      </div>
      
      <div className="w-px bg-gray-200 mx-2"></div>
      
      <div className="flex-1 text-center px-2">
        <div className="text-gray-500 text-sm mb-1">
          <span>Lãi phí đã thu</span>
        </div>
        <div className="text-base font-semibold text-gray-800">
          {Math.floor((fundStatus.collectedInterest || fundStatus.profit * 0.4) / 1000).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
