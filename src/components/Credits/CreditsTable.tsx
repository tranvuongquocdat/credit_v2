import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { MoreVertical, DollarSignIcon, UnlockIcon } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { getInterestDisplayString } from '@/lib/interest-calculator';
import { useState, useEffect, useCallback } from 'react';
import { reopenContract } from '@/lib/Credits/reopen_contract';
import { getCreditPaymentHistory } from '@/lib/Credits/payment_history';
import { calculateDebtToLatestPaidPeriod } from '@/lib/Credits/calculate_remaining_debt';
import { getExpectedMoney } from '@/lib/Credits/get_expected_money';
import { calculateActualLoanAmount } from '@/lib/Credits/calculate_actual_loan_amount';
import { useToast } from '../ui/use-toast';
import { CreditFinancialDetail } from '@/hooks/useCreditCalculation';
import { getLatestPaymentPaidDate } from '@/lib/Credits/get_latest_payment_paid_date';
import { calculateMultipleCreditStatus, CreditStatusResult } from '@/lib/Credits/calculate_credit_status';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface CreditsTableProps {
  credits: CreditWithCustomer[];
  statusMap: StatusMapType;
  calculatedDetails?: Record<string, CreditFinancialDetail>;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (credit: CreditWithCustomer) => void;
  onUpdateStatus: (credit: CreditWithCustomer) => void;
  onShowPaymentHistory?: (credit: CreditWithCustomer) => void;
  onRefresh?: () => void;
}

// Kết quả truy vấn từ hàm calculateCreditPayment
interface CreditPaymentInfo {
  paidInterest: number;
  oldDebt: number;
  loading: boolean;
}

// Kết quả truy vấn từ hàm calculateNextPaymentDate
interface NextPaymentInfo {
  nextDate: string | null;
  isCompleted: boolean;
  loading: boolean;
}

// Kết quả truy vấn từ hàm calculateInterestToday
interface InterestTodayInfo {
  interestToday: number;
  loading: boolean;
}

// Thêm interface cho actual loan amount
interface ActualLoanAmountInfo {
  actualAmount: number;
  loading: boolean;
}

export function CreditsTable({ 
  credits, 
  statusMap,
  calculatedDetails,
  onView, 
  onEdit, 
  onDelete, 
  onUpdateStatus,
  onShowPaymentHistory,
  onRefresh
}: CreditsTableProps) {
  // State để lưu trữ thông tin thanh toán cho mỗi credit
  const [paymentInfo, setPaymentInfo] = useState<Record<string, CreditPaymentInfo>>({});
  
  // State để lưu trữ thông tin ngày thanh toán tiếp theo
  const [nextPaymentInfo, setNextPaymentInfo] = useState<Record<string, NextPaymentInfo>>({});
  
  // State để lưu trữ thông tin lãi phí đến hôm nay
  const [interestTodayInfo, setInterestTodayInfo] = useState<Record<string, InterestTodayInfo>>({});
  
  // State để lưu trữ thông tin có kỳ thanh toán đã được thanh toán hay không cho mỗi credit
  const [hasPaidPaymentPeriods, setHasPaidPaymentPeriods] = useState<Record<string, boolean>>({});
  
  // State cho actual loan amount
  const [actualLoanAmounts, setActualLoanAmounts] = useState<Record<string, ActualLoanAmountInfo>>({});
  
  // State cho calculated status
  const [calculatedStatuses, setCalculatedStatuses] = useState<Record<string, CreditStatusResult>>({});
  
  // Toast hook
  const { toast } = useToast();
  
  // Format tiền tệ
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Format ngày tháng
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: vi });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  };
  
  // Hàm tái sử dụng để tính toán lãi phí đã đóng và nợ cũ - TỐI ƯU HÓA
  const calculateCreditPayment = useCallback(async (creditId: string): Promise<CreditPaymentInfo> => {
    try {
      // Sử dụng Promise.all để chạy song song
      const [paymentHistory, oldDebt] = await Promise.all([
        // 1. Lấy payment history và tính tổng lãi phí đã đóng
        getCreditPaymentHistory(creditId),
        // 2. Tính nợ cũ bằng calculateDebtToLatestPaidPeriod
        calculateDebtToLatestPaidPeriod(creditId)
      ]);
      
      // Tính tổng lãi phí đã đóng từ payment history
      const paidInterest = paymentHistory
        .filter(record => record.transaction_type === 'payment' && record.is_deleted === false)
        .reduce((sum, record) => sum + (record.credit_amount || 0), 0);
      
      console.log(`Credit ${creditId}: Paid interest = ${paidInterest}, Old debt = ${oldDebt}`);
      
      return { 
        paidInterest: Math.round(paidInterest), 
        oldDebt: Math.round(oldDebt), 
        loading: false 
      };
    } catch (error) {
      console.error(`Error calculating payment info for credit ${creditId}:`, error);
      return { paidInterest: 0, oldDebt: 0, loading: false };
    }
  }, []);
  
  // Hàm tính toán ngày phải đóng lãi phí tiếp theo
  const calculateNextPaymentDate = useCallback(async (creditId: string, credit: CreditWithCustomer): Promise<NextPaymentInfo> => {
    try {
      // Lấy ngày thanh toán gần nhất từ hàm getLatestPaymentPaidDate
      const latestPaymentDate = await getLatestPaymentPaidDate(creditId);
      
      // Lấy ngày bắt đầu khoản vay
      const loanStartDate = new Date(credit.loan_date);
      
      // Tính ngày kết thúc hợp đồng
      const loanEndDate = new Date(loanStartDate);
      let loanPeriodDays = credit.loan_period;
      loanEndDate.setDate(loanStartDate.getDate() + loanPeriodDays - 1);
      
      // Lấy kỳ lãi (số ngày)
      const interestPeriod = credit.interest_period || 30; // Mặc định là 30 ngày
      
      // Nếu không có thanh toán nào trước đây
      if (!latestPaymentDate) {
        // Tính ngày kết thúc của kỳ đầu tiên
        const firstPeriodEndDate = new Date(loanStartDate);
        firstPeriodEndDate.setDate(loanStartDate.getDate() + interestPeriod - 1);
        
        // Kiểm tra xem ngày kết thúc kỳ đầu tiên có vượt quá ngày kết thúc hợp đồng không
        if (firstPeriodEndDate > loanEndDate) {
          return { nextDate: null, isCompleted: true, loading: false };
        }
        
        return { nextDate: firstPeriodEndDate.toISOString(), isCompleted: false, loading: false };
      }
      
      // Nếu có thanh toán trước đây, tính kỳ tiếp theo
      const lastPaymentDate = new Date(latestPaymentDate);
      const nextPaymentDate = new Date(lastPaymentDate);
      nextPaymentDate.setDate(lastPaymentDate.getDate() + interestPeriod);
      
      // Kiểm tra xem ngày thanh toán tiếp theo có vượt quá ngày kết thúc hợp đồng không
      if (nextPaymentDate > loanEndDate) {
        return { nextDate: null, isCompleted: true, loading: false };
      }
      
      return { nextDate: nextPaymentDate.toISOString(), isCompleted: false, loading: false };
    } catch (error) {
      console.error(`Error calculating next payment date for credit ${creditId}:`, error);
      return { nextDate: null, isCompleted: false, loading: false };
    }
  }, []);
  
  // Hàm kiểm tra xem credit có kỳ thanh toán nào đã được thanh toán không - TỐI ƯU HÓA
  const checkHasPaidPaymentPeriods = useCallback(async (creditId: string): Promise<boolean> => {
    try {
      // Sử dụng getCreditPaymentHistory thay vì query trực tiếp
      const paymentHistory = await getCreditPaymentHistory(creditId);
      
      // Kiểm tra xem có payment nào với credit_amount > 0 và chưa bị xóa
      const hasPaidPayments = paymentHistory.some(record => 
        record.transaction_type === 'payment' && 
        record.is_deleted === false && 
        (record.credit_amount || 0) > 0
      );
      
      return hasPaidPayments;
    } catch (error) {
      console.error('Error in checkHasPaidPaymentPeriods:', error);
      return false;
    }
  }, []);

  // Hàm tính toán lãi phí đến hôm nay
  const calculateInterestToday = useCallback(async (creditId: string, credit: CreditWithCustomer): Promise<InterestTodayInfo> => {
    try {
      const dailyAmounts = await getExpectedMoney(creditId);
      const today = new Date();
      const loanStart = new Date(credit.loan_date);
      const daysSinceLoan = Math.floor((today.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate interest up to today
      const interestToday = dailyAmounts.slice(0, daysSinceLoan + 1).reduce((sum, amount) => sum + amount, 0);
      
      return { interestToday: Math.round(interestToday), loading: false };
    } catch (error) {
      console.error(`Error calculating interest to today for credit ${creditId}:`, error);
      return { interestToday: 0, loading: false };
    }
  }, []);

  // Hàm tính actual loan amount
  const calculateActualLoanAmountInfo = useCallback(async (creditId: string): Promise<ActualLoanAmountInfo> => {
    try {
      const actualAmount = await calculateActualLoanAmount(creditId);
      return { actualAmount: Math.round(actualAmount), loading: false };
    } catch (error) {
      console.error(`Error calculating actual loan amount for credit ${creditId}:`, error);
      return { actualAmount: 0, loading: false };
    }
  }, []);

  // Tải dữ liệu thanh toán cho tất cả các credit - CẬP NHẬT LOGGING
  useEffect(() => {
    if (calculatedDetails && Object.keys(calculatedDetails).length > 0) {
      // Use provided calculated data
      const newPaymentInfo: Record<string, CreditPaymentInfo> = {};
      const newNextPaymentInfo: Record<string, NextPaymentInfo> = {};
      const newInterestTodayInfo: Record<string, InterestTodayInfo> = {};
      const newHasPaidPaymentPeriodsInfo: Record<string, boolean> = {};
      const newActualLoanAmountInfo: Record<string, ActualLoanAmountInfo> = {};
      
      Object.values(calculatedDetails).forEach(detail => {
        newPaymentInfo[detail.creditId] = {
          paidInterest: detail.paidInterest,
          oldDebt: detail.oldDebt,
          loading: false
        };
        
        newNextPaymentInfo[detail.creditId] = {
          nextDate: null,
          isCompleted: false,
          loading: false
        };
        
        newInterestTodayInfo[detail.creditId] = {
          interestToday: detail.interestToday,
          loading: false
        };
        
        newHasPaidPaymentPeriodsInfo[detail.creditId] = false;
        
        newActualLoanAmountInfo[detail.creditId] = {
          actualAmount: detail.actualLoanAmount,
          loading: false
        };
      });
      
      setPaymentInfo(newPaymentInfo);
      setNextPaymentInfo(newNextPaymentInfo);
      setInterestTodayInfo(newInterestTodayInfo);
      setHasPaidPaymentPeriods(newHasPaidPaymentPeriodsInfo);
      setActualLoanAmounts(newActualLoanAmountInfo);
      
      console.log('CreditsTable: Using calculated data from hook');
      return;
    }
    
    // Fallback: Calculate if no data provided (existing logic)
    console.log('CreditsTable: Fallback to individual calculations');
    // Khởi tạo trạng thái loading cho tất cả credit
    const initialLoadingState: Record<string, CreditPaymentInfo> = {};
    const initialNextPaymentState: Record<string, NextPaymentInfo> = {};
    const initialInterestTodayState: Record<string, InterestTodayInfo> = {};
    const initialHasPaidPaymentPeriodsState: Record<string, boolean> = {};
    const initialActualLoanAmountState: Record<string, ActualLoanAmountInfo> = {};
    
    credits.forEach(credit => {
      initialLoadingState[credit.id] = { paidInterest: 0, oldDebt: 0, loading: true };
      initialNextPaymentState[credit.id] = { nextDate: null, isCompleted: false, loading: true };
      initialInterestTodayState[credit.id] = { interestToday: 0, loading: true };
      initialHasPaidPaymentPeriodsState[credit.id] = false;
      initialActualLoanAmountState[credit.id] = { actualAmount: 0, loading: true };
    });
    
    setPaymentInfo(initialLoadingState);
    setNextPaymentInfo(initialNextPaymentState);
    setInterestTodayInfo(initialInterestTodayState);
    setHasPaidPaymentPeriods(initialHasPaidPaymentPeriodsState);
    setActualLoanAmounts(initialActualLoanAmountState);
    
    // Tải dữ liệu cho tất cả credit song song
    const loadData = async () => {
      try {
        console.time('Load all credit data');
        
        // Calculate statuses for all credits in parallel
        const creditIds = credits.map(credit => credit.id);
        const statusResults = await calculateMultipleCreditStatus(creditIds);
        
        // Process all credits in parallel using Promise.all
        const results = await Promise.all(
          credits.map(async (credit) => {
            console.time(`Credit ${credit.id}`);
            
            const [info, nextPayment, interestToday, hasPaidPayments, actualLoanAmount] = await Promise.all([
              calculateCreditPayment(credit.id),
              calculateNextPaymentDate(credit.id, credit),
              calculateInterestToday(credit.id, credit),
              checkHasPaidPaymentPeriods(credit.id),
              calculateActualLoanAmountInfo(credit.id)
            ]);
            
            console.timeEnd(`Credit ${credit.id}`);
            
            return {
              creditId: credit.id,
              info,
              nextPayment,
              interestToday,
              hasPaidPayments,
              actualLoanAmount
            };
          })
        );
        
        console.timeEnd('Load all credit data');
        console.log(`Loaded data for ${results.length} credits`);
        
        // Update all states at once
        const newPaymentInfo: Record<string, CreditPaymentInfo> = {};
        const newNextPaymentInfo: Record<string, NextPaymentInfo> = {};
        const newInterestTodayInfo: Record<string, InterestTodayInfo> = {};
        const newHasPaidPaymentPeriodsInfo: Record<string, boolean> = {};
        const newActualLoanAmountInfo: Record<string, ActualLoanAmountInfo> = {};
        
        results.forEach(({ creditId, info, nextPayment, interestToday, hasPaidPayments, actualLoanAmount }) => {
          newPaymentInfo[creditId] = info;
          newNextPaymentInfo[creditId] = nextPayment;
          newInterestTodayInfo[creditId] = interestToday;
          newHasPaidPaymentPeriodsInfo[creditId] = hasPaidPayments;
          newActualLoanAmountInfo[creditId] = actualLoanAmount;
        });
        
        setPaymentInfo(newPaymentInfo);
        setNextPaymentInfo(newNextPaymentInfo);
        setInterestTodayInfo(newInterestTodayInfo);
        setHasPaidPaymentPeriods(newHasPaidPaymentPeriodsInfo);
        setActualLoanAmounts(newActualLoanAmountInfo);
        setCalculatedStatuses(statusResults);
      } catch (error) {
        console.error('Error loading credit data:', error);
      }
    };
    
    if (credits.length > 0) {
      loadData();
    }
  }, [credits, calculateCreditPayment, calculateNextPaymentDate, calculateInterestToday, checkHasPaidPaymentPeriods, calculateActualLoanAmountInfo]);

  return (
    <div className="rounded-md border overflow-hidden mb-4">
      <Table className="border-collapse">
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="py-2 px-3 text-center font-medium w-12 border-b border-r border-gray-200">#</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Mã HĐ</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tên KH</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Tài sản</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium border-b border-r border-gray-200">Số tiền</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Ngày vay</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Lãi phí đã đóng</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Nợ cũ</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Lãi phí đến hôm nay</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Ngày phải đóng lãi phí</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-28 border-b border-r border-gray-200">Tình trạng</TableHead>
            <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {credits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="py-8 text-center text-gray-500 border-b border-gray-200">
                Không tìm thấy hợp đồng nào
              </TableCell>
            </TableRow>
          ) : (
            credits.map((credit, index) => (
              <TableRow key={credit.id} className="hover:bg-gray-50 transition-colors">
                <TableCell className="py-3 px-3 text-gray-500 text-center border-b border-r border-gray-200">{index + 1}</TableCell>
                <TableCell 
                  className="py-3 px-3 font-medium text-blue-600 cursor-pointer text-center border-b border-r border-gray-200" 
                  onClick={() => onEdit(credit.id)}
                >
                  {credit.contract_code || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {credit.customer?.name || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {credit.collateral || '-'}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    {actualLoanAmounts[credit.id]?.loading ? (
                      <span className="text-gray-400">Đang tải...</span>
                    ) : (
                      formatCurrency(actualLoanAmounts[credit.id]?.actualAmount || credit.loan_amount)
                    )}
                    <div className="text-xs text-red-800 mt-1">
                      {getInterestDisplayString(credit)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-gray-600 text-center border-b border-r border-gray-200">
                  <div className="flex flex-col items-center">
                    <span className="text-base">{formatDate(credit.loan_date)}</span>
                    <div className="text-xs text-gray-400 mt-1">
                      Kỳ lãi: {credit.interest_period} {
                        credit.interest_ui_type?.startsWith('weekly') 
                          ? 'ngày (tuần)' 
                          : credit.interest_ui_type?.startsWith('monthly') 
                            ? 'ngày (tháng)' 
                            : 'ngày'
                      }
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {paymentInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : (
                    formatCurrency(paymentInfo[credit.id]?.paidInterest || 0)
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {paymentInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : (
                    formatCurrency(paymentInfo[credit.id]?.oldDebt || 0)
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 text-center text-rose-600 font-medium border-b border-r border-gray-200">
                  {interestTodayInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : (
                    formatCurrency(interestTodayInfo[credit.id]?.interestToday || 0)
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 text-center border-b border-r border-gray-200">
                  {nextPaymentInfo[credit.id]?.loading ? (
                    <span className="text-gray-400">Đang tải...</span>
                  ) : nextPaymentInfo[credit.id]?.isCompleted ? (
                    <span className="text-green-600 font-medium">Hoàn thành</span>
                  ) : nextPaymentInfo[credit.id]?.nextDate ? (
                    <span className={
                      // Thêm màu đỏ nếu ngày thanh toán đã qua
                      new Date(nextPaymentInfo[credit.id].nextDate as string) < new Date() 
                        ? "text-red-600 font-medium" 
                        : ""
                    }>
                      {formatDate(nextPaymentInfo[credit.id].nextDate)}
                    </span>
                  ) : (
                    <span>-</span>
                  )}
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                  <div className="flex justify-center">
                    <Badge
                      variant="outline"
                      className={(() => {
                        // Use calculated status if available
                        const calculatedStatus = calculatedStatuses[credit.id];
                        if (calculatedStatus) {
                          switch (calculatedStatus.statusCode) {
                            case 'CLOSED':
                              return "bg-blue-100 text-blue-800 border-blue-200";
                            case 'DELETED':
                              return "bg-gray-100 text-gray-800 border-gray-200";
                            case 'FINISHED':
                              return "bg-emerald-100 text-emerald-800 border-emerald-200";
                            case 'BAD_DEBT':
                              return "bg-purple-100 text-purple-800 border-purple-200";
                            case 'OVERDUE':
                              return "bg-red-100 text-red-800 border-red-200";
                            case 'LATE_INTEREST':
                              return "bg-yellow-100 text-yellow-800 border-yellow-200";
                            case 'ACTIVE':
                            default:
                              return "bg-green-100 text-green-800 border-green-200";
                          }
                        }
                        
                        // Fallback to original logic
                        if (credit.status === 'closed' || credit.status === 'deleted') {
                          return statusMap[credit.status]?.color || "bg-gray-100 text-gray-800";
                        }
                        
                        const nextPayment = nextPaymentInfo[credit.id];
                        if (nextPayment?.isCompleted) {
                          return "bg-emerald-100 text-emerald-800 border-emerald-200"; // Finished
                        }
                        
                        if (nextPayment?.nextDate) {
                          const nextPaymentDate = new Date(nextPayment.nextDate);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          nextPaymentDate.setHours(0, 0, 0, 0);
                          
                          // Check if payment is overdue
                          if (today > nextPaymentDate) {
                            return "bg-red-100 text-red-800 border-red-200"; // Overdue
                          }
                          
                          // Check if payment is due today
                          if (today.getTime() === nextPaymentDate.getTime()) {
                            return "bg-amber-100 text-amber-800 border-amber-200"; // Due today
                          }
                          
                          // Check if payment is due tomorrow
                          const tomorrow = new Date(today);
                          tomorrow.setDate(today.getDate() + 1);
                          if (tomorrow.getTime() === nextPaymentDate.getTime()) {
                            return "bg-blue-100 text-blue-800 border-blue-200"; // Due tomorrow
                          }
                          
                          // Payment is in the future
                          return "bg-green-100 text-green-800 border-green-200"; // On time
                        }
                        
                        // Default to original status
                        return statusMap[credit.status || CreditStatus.ON_TIME]?.color || "bg-gray-100 text-gray-800";
                      })()}
                    >
                      {(() => {
                        // Use calculated status if available
                        const calculatedStatus = calculatedStatuses[credit.id];
                        if (calculatedStatus) {
                          return calculatedStatus.status;
                        }
                        
                        // Fallback to original logic
                        if (credit.status === 'closed') {
                          return "Đã đóng";
                        }
                        if (credit.status === 'deleted') {
                          return "Đã xóa";
                        }
                        
                        const nextPayment = nextPaymentInfo[credit.id];
                        if (nextPayment?.isCompleted) {
                          return "Hoàn thành";
                        }
                        
                        if (nextPayment?.nextDate) {
                          const nextPaymentDate = new Date(nextPayment.nextDate);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          nextPaymentDate.setHours(0, 0, 0, 0);
                          
                          // Check if payment is overdue
                          if (today > nextPaymentDate) {
                            return "Quá hạn";
                          }
                          
                          // Check if payment is due today
                          if (today.getTime() === nextPaymentDate.getTime()) {
                            return "Hôm nay";
                          }
                          
                          // Check if payment is due tomorrow
                          const tomorrow = new Date(today);
                          tomorrow.setDate(today.getDate() + 1);
                          if (tomorrow.getTime() === nextPaymentDate.getTime()) {
                            return "Ngày mai";
                          }
                          
                          // Payment is in the future
                          return "Đang vay";
                        }
                        
                        // Default to original status
                        return statusMap[credit.status || CreditStatus.ON_TIME]?.label || "Không xác định";
                      })()}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="py-3 px-3 border-b border-gray-200">
                  <div className="flex justify-center space-x-1">
                    {onShowPaymentHistory && (
                      credit.status === 'closed' ? (
                        <>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-green-700" 
                            onClick={async () => { 
                              try {
                                await reopenContract(credit.id);
                                
                                // Show success toast
                                toast({
                                  title: "Thành công",
                                  description: "Đã mở lại hợp đồng thành công",
                                  variant: "default",
                                });
                                
                                // Refresh the page
                                if (onRefresh) onRefresh();
                              } catch (error) {
                                console.error('Error reopening contract:', error);
                                
                                // Show error toast
                                toast({
                                  title: "Lỗi",
                                  description: error instanceof Error ? error.message : "Có lỗi xảy ra khi mở lại hợp đồng",
                                  variant: "destructive",
                                });
                              }
                            }}
                            title="Mở lại hợp đồng"
                          >
                            <UnlockIcon className="h-4 w-4 text-amber-500" />
                          </Button>
                        </>
                      ) : credit.status === 'deleted' ? (
                        // Hợp đồng đã xóa - chỉ hiển thị nút xem chi tiết
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          onClick={() => onShowPaymentHistory(credit)}
                          title="Xem chi tiết"
                        >
                          <DollarSignIcon className="h-4 w-4 text-gray-400" />
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          className="h-8 w-8 p-0" 
                          onClick={() => onShowPaymentHistory(credit)}
                          title="Lịch sử thanh toán"
                        >
                          <DollarSignIcon className="h-4 w-4 text-gray-500" />
                        </Button>
                      )
                    )}
                    {/* Hiển thị dropdown menu nếu: hợp đồng đã đóng HOẶC (hợp đồng chưa bị xóa và chưa có kỳ thanh toán đã được thanh toán) */}
                    {(credit.status === 'closed' || (credit.status !== 'deleted' && !hasPaidPaymentPeriods[credit.id])) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Mở menu</span>
                            <MoreVertical className="h-4 w-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {/* Hiển thị "Lịch sử thanh toán" cho hợp đồng đã đóng */}
                          {credit.status === 'closed' && onShowPaymentHistory && (
                            <DropdownMenuItem onClick={() => onShowPaymentHistory(credit)}>
                              Lịch sử thanh toán
                            </DropdownMenuItem>
                          )}
                          {/* Hiển thị "Xóa hợp đồng" cho hợp đồng chưa có kỳ thanh toán đã được thanh toán */}
                          {credit.status !== 'closed' && (
                            <DropdownMenuItem onClick={() => onDelete(credit)} className="text-red-600">
                              Xóa hợp đồng
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
