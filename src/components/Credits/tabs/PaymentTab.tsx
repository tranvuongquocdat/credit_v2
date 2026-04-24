'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { CreditPaymentPeriod } from '@/models/credit-payment';
import { toast } from '@/components/ui/use-toast';
import { getExpectedMoney } from '@/lib/Credits/get_expected_money';
import { supabase } from '@/lib/supabase';
import { convertFromHistoryToTimeArrayWithStatus } from '@/lib/Credits/convert_from_history_to_time_array';
import { getCreditPaymentHistory } from '@/lib/Credits/payment_history';
import { PaymentForm } from '../PaymentForm';
import { 
  calculateCustomPeriodInterest, 
} from '@/lib/Credits/save_custom_payment';
import { getLatestPaymentPaidDate } from '@/lib/Credits/get_latest_payment_paid_date';
import { getCurrentUser } from '@/lib/auth';
import { usePermissions } from '@/hooks/usePermissions';
type PaymentTabProps = {
  credit: CreditWithCustomer | null;
  loading?: boolean;
  error: string | null;
  showPaymentForm: boolean;
  setShowPaymentForm: (show: boolean) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  calculateDaysBetween: (start: Date, end: Date) => number;
  onDataChange?: () => void;
  onOptimisticStateChange?: (hasOptimisticUpdates: boolean) => void;
  onPaymentUpdate?: () => void;
};

// Helper function to format number with thousand separators for input
const formatNumberInput = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Helper function to parse formatted number back to number
const parseFormattedNumber = (str: string): number => {
  return parseInt(str.replace(/\./g, "")) || 0;
};

export function PaymentTab({
  credit,
  loading,
  error,
  showPaymentForm,
  setShowPaymentForm,
  formatCurrency,
  formatDate,
  calculateDaysBetween,
  onDataChange,
  onOptimisticStateChange,
  onPaymentUpdate
}: PaymentTabProps) {
  // State for inline payment editing
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  // Add loading state for checkbox operations
  const [loadingPeriods, setLoadingPeriods] = useState<Record<string, boolean>>({});
  const [isProcessingCheckbox, setIsProcessingCheckbox] = useState(false);
  const { hasPermission } = usePermissions();
  // State for generated periods from getExpectedMoney
  const [generatedPeriods, setGeneratedPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // NEW: Optimistic updates state
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, boolean>>({});
    
  // NEW: Background sync state
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  // Generate periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney
  useEffect(() => {
    async function generatePeriodsFromExpectedMoney() {
      if (!credit?.id) return;
      
      setIsGenerating(true);
      try {
        console.log('🔄 Generating periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney');
        
        // 1. Get payment history from database - filter out deleted records
        const allPaymentHistory = await getCreditPaymentHistory(credit.id);
        const paymentHistory = allPaymentHistory.filter(record => !record.is_deleted);
        console.log('Payment history from DB:', paymentHistory.length, 'active records (', allPaymentHistory.length, 'total)');
        
        // 2. Get daily interest amounts using getExpectedMoney
        const dailyAmounts = await getExpectedMoney(credit.id);
        console.log('Daily amounts from getExpectedMoney:', dailyAmounts.length, 'days');
        
        // 3. Calculate loan end date
        const loanStartDate = credit.loan_date;
        const startDate = new Date(loanStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
        const loanEndDate = endDate.toISOString().split('T')[0];
        
        console.log('Loan period:', loanStartDate, '→', loanEndDate);
        
        // 4. Use convertFromHistoryToTimeArrayWithStatus to get periods and statuses
        const interestPeriod = credit.interest_period || 30;
        const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
          loanStartDate,
          loanEndDate,
          interestPeriod,
          paymentHistory,
          paymentHistory
        );
        
        console.log('Generated time periods:', timePeriods.length, 'periods');
        console.log('Statuses:', statuses);
        
        // 5. Calculate expected amount for each period using getExpectedMoney
        const allPeriods: CreditPaymentPeriod[] = [];
        const loanStart = new Date(loanStartDate);
        
        timePeriods.forEach((timePeriod, index) => {
          const [start_date, end_date] = timePeriod;
          const isChecked = statuses[index];
          const periodNumber = index + 1;
          
          // Calculate start and end day indices relative to loan start
          const periodStartDate = new Date(start_date);
          const periodEndDate = new Date(end_date);
          
          const startDayIndex = Math.floor((periodStartDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
          const endDayIndex = Math.floor((periodEndDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
          
          // Calculate expected amount by summing daily amounts from getExpectedMoney
          let expectedAmount = 0;
          for (let dayIndex = startDayIndex; dayIndex <= endDayIndex && dayIndex < dailyAmounts.length; dayIndex++) {
            if (dayIndex >= 0) {
              expectedAmount += dailyAmounts[dayIndex];
            }
          }
          
          // Tính actual amount dựa vào lịch sử (dùng effective date để query đúng kỳ cần tính)
          let actualAmount = 0;
          if (isChecked) {
            // const periodPayments = paymentHistory.filter(payment => {
            //   const paymentDate = payment.effective_date?.split('T')[0] || '';
            //   const startDate = start_date.split('T')[0]; // Remove time part
            //   const endDate = end_date.split('T')[0];     // Remove time part
              
            //   console.log('Comparing:', paymentDate, 'between', startDate, 'and', endDate);
            //   return paymentDate >= startDate && paymentDate <= endDate;
            // });
            
            // actualAmount = periodPayments.reduce((sum, payment) => {
            //   return sum + (payment.credit_amount || 0) - (payment.debit_amount || 0);
            // }, 0);
            for (let i = startDayIndex; i <= endDayIndex; i++) {
              actualAmount += (paymentHistory[i].credit_amount || 0) - (paymentHistory[i].debit_amount || 0);
            }
          }
          
          
          const newPeriod: CreditPaymentPeriod = {
            id: isChecked ? `db-${periodNumber}` : `generated-${periodNumber}`,
            credit_id: credit.id,
            period_number: periodNumber,
            start_date: periodStartDate.toISOString(),
            end_date: periodEndDate.toISOString(),
            expected_amount: Math.round(expectedAmount),
            actual_amount: Math.round(actualAmount),
            payment_date: isChecked ? end_date : null,
            notes: null,
            other_amount: 0,
            is_temporary: false
          };
          
          allPeriods.push(newPeriod);
        });
        
        setGeneratedPeriods(allPeriods);
        console.log('✅ Generated', allPeriods.length, 'periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney');
        
      } catch (error) {
        console.error('Error generating periods:', error);
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Có lỗi xảy ra khi tạo các kỳ thanh toán"
        });
      } finally {
        setIsGenerating(false);
      }
    }
    
    generatePeriodsFromExpectedMoney();
  }, [credit?.id, onDataChange]);

  // Use generated periods for display
  const periodsToDisplay = generatedPeriods;
  // NEW: Helper function to get effective checked state with optimistic updates
  const getEffectiveCheckedState = (period: CreditPaymentPeriod) => {
    const periodId = period.id || `temp-${period.period_number}`;
    const hasOptimisticUpdate = periodId in optimisticUpdates;
    
    if (hasOptimisticUpdate) {
      return optimisticUpdates[periodId];
    }
    
    // Fall back to actual data
    return Boolean(period.id && period.id.startsWith('db-') && (period.actual_amount || 0) > 0);
  };

  // NEW: Background sync function
  const handleBackgroundSync = async () => {
    if (!onDataChange) return;
    
    setIsBackgroundSyncing(true);
    try {
      onDataChange();
      // Add delay to ensure sync completes and show feedback
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setIsBackgroundSyncing(false);
    }
  };
  const startEditing = (period: CreditPaymentPeriod) => {
    // Don't allow editing if period already has payments or if processing
    const hasPayments = getEffectiveCheckedState(period);
    if (hasPayments || isProcessingCheckbox) return;
    
    // Only allow editing the earliest unpaid period
    const earliestUnpaidIndex = periodsToDisplay.findIndex(p => 
      !getEffectiveCheckedState(p)
    );
    const currentIndex = periodsToDisplay.findIndex(p => 
      (p.id === period.id) || (p.period_number === period.period_number)
    );
    
    if (currentIndex !== earliestUnpaidIndex) return;
    
    setEditingPeriodId(period.id || `temp-${period.period_number}`);
    setPaymentAmount(period.actual_amount || period.expected_amount || 0);
  };
  
  // Stop editing and cancel
  const cancelEditing = () => {
    setEditingPeriodId(null);
  };
  
  // UPDATED: Enhanced checkbox handler with optimistic updates
  const handleCheckboxChange = async (period: CreditPaymentPeriod, checked: boolean) => {
    if (!credit?.id || isProcessingCheckbox) return;
    // Kiểm tra quyền
    if (checked && !hasPermission('dong_lai_tin_chap')) {
      toast({
        variant: "destructive",
        title: "Không có quyền",
        description: "Bạn không có quyền đóng lãi"
      });
      return;
    }
    
    if (!checked && !hasPermission('huy_dong_lai_tin_chap')) {
      toast({
        variant: "destructive",
        title: "Không có quyền",
        description: "Bạn không có quyền hủy đóng lãi"
      });
      return;
    }

    const periodId = period.id || `temp-${period.period_number}`;
    
    // Set processing state
    setIsProcessingCheckbox(true);
    
    // 1. OPTIMISTIC UPDATE - Update UI immediately
    setOptimisticUpdates(prev => ({
      ...prev,
      [periodId]: checked
    }));
    
    // Set loading state for this period only
    setLoadingPeriods(prev => ({ ...prev, [periodId]: true }));
    const { id: userId } = await getCurrentUser();
    try {
      if (checked) {
        // 1. Lấy ngày cuối cùng đã đóng tiền
        const { getLatestPaymentPaidDate } = await import('@/lib/Credits/get_latest_payment_paid_date');
        const latestPaidDate = await getLatestPaymentPaidDate(credit.id);
        
        // 2. Xác định ngày bắt đầu cho việc tạo payment records
        let startDate: string;
        if (latestPaidDate) {
          // Nếu có ngày đã đóng, bắt đầu từ ngày hôm sau
          const nextDay = new Date(latestPaidDate);
          nextDay.setDate(nextDay.getDate() + 1);
          startDate = nextDay.toISOString().split('T')[0];
        } else {
          // Nếu chưa đóng lần nào, bắt đầu từ ngày vay
          startDate = credit.loan_date;
        }
        
        // 3. Xác định ngày kết thúc (ngày cuối của kỳ được chọn)
        const endDate = period.end_date.split('T')[0];
        
        console.log(`Creating payment records from ${startDate} to ${endDate}`);
        
        // 4. Tính toán số ngày và chia thành các chu kỳ
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const totalDays = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        if (totalDays <= 0) {
          throw new Error('Ngày này đã được đóng lãi. Bạn có thể tải lại bảng để xem lại');
        }
        
        // 5. Lấy expected money để tính số tiền cho từng ngày
        const dailyAmounts = await getExpectedMoney(credit.id);
        const loanStart = new Date(credit.loan_date);
        
        // 6. Chia thành các chu kỳ con dựa trên interest_period
        const interestPeriod = credit.interest_period || 30;
        const cycles = [];
        
        let currentStart = new Date(startDateObj);
        
        while (currentStart <= endDateObj) {
          let currentEnd = new Date(currentStart);
          currentEnd.setDate(currentStart.getDate() + interestPeriod - 1);
          
          // Nếu ngày kết thúc vượt quá endDate, điều chỉnh
          if (currentEnd > endDateObj) {
            currentEnd = new Date(endDateObj);
          }
          
          cycles.push({
            start: new Date(currentStart),
            end: new Date(currentEnd)
          });
          
          // Di chuyển đến chu kỳ tiếp theo
          currentStart = new Date(currentEnd);
          currentStart.setDate(currentStart.getDate() + 1);
        }
        
        console.log(`Created ${cycles.length} cycles:`, cycles.map(c => 
          `${c.start.toISOString().split('T')[0]} → ${c.end.toISOString().split('T')[0]}`
        ));
        
        // 7. Tạo records cho từng chu kỳ
        const allRecords: Array<{
          credit_id: string;
          transaction_type: 'payment';
          effective_date: string;
          date_status: string | null;
          credit_amount: number;
          debit_amount: number;
          description: string;
          is_deleted: boolean;
        }> = [];
        
        // Kiểm tra nếu đang chỉnh sửa và có giá trị paymentAmount
        const isCustomPayment = editingPeriodId === periodId && paymentAmount > 0;
        const expectedTotal = period.expected_amount || 0;
        
        // Nếu đang chỉnh sửa và có giá trị paymentAmount, sử dụng tỷ lệ để phân bổ
        const paymentRatio = isCustomPayment ? paymentAmount / expectedTotal : 1;
        
        cycles.forEach((cycle, cycleIndex) => {
          const cycleStartDate = cycle.start;
          const cycleEndDate = cycle.end;
          const cycleDays = Math.floor((cycleEndDate.getTime() - cycleStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          for (let dayOffset = 0; dayOffset < cycleDays; dayOffset++) {
            const currentDate = new Date(cycleStartDate);
            currentDate.setDate(cycleStartDate.getDate() + dayOffset);
            
            // Tính index ngày so với ngày vay để lấy expected amount
            const dayIndex = Math.floor((currentDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
            const dayAmount = (dayIndex >= 0 && dayIndex < dailyAmounts.length) ? dailyAmounts[dayIndex] : 0;
            
            // Áp dụng tỷ lệ nếu đang chỉnh sửa
            const adjustedDayAmount = isCustomPayment ? Math.round(dayAmount * paymentRatio) : Math.round(dayAmount);
            
            // Xác định date_status cho chu kỳ này
            let dateStatus: string | null = null;
            if (cycleDays === 1) {
              dateStatus = 'only';
            } else if (dayOffset === 0) {
              dateStatus = 'start';
            } else if (dayOffset === cycleDays - 1) {
              dateStatus = 'end';
            }
            
            const dailyRecord = {
              credit_id: credit.id,
              transaction_type: 'payment' as const,
              effective_date: currentDate.toISOString(),
              date_status: dateStatus,
              credit_amount: adjustedDayAmount,
              debit_amount: 0,
              description: `Thanh toán chu kỳ ${cycleIndex + 1}/${cycles.length}, ngày ${dayOffset + 1}/${cycleDays} đến kỳ ${period.period_number}`,
              is_deleted: false,
              created_by: userId,
            };
            
            allRecords.push(dailyRecord);
          }
        });
        
        console.log(`Prepared ${allRecords.length} daily records for batch insert`);
        
        // 8. Batch upsert tất cả records
        const { error } = await supabase
          .from('credit_history')
          .upsert(allRecords)
          .select();
        
        if (error) {
          throw new Error(error.message);
        }
        
        console.log(`Successfully inserted ${allRecords.length} payment records`);
        
        // Reset editing state
        setEditingPeriodId(null);
        
        // Hiển thị thông báo thành công
        const paymentDescription = isCustomPayment 
          ? `Đã tạo ${allRecords.length} bản ghi thanh toán với số tiền ${formatCurrency(paymentAmount)} cho kỳ ${period.period_number}`
          : `Đã tạo ${allRecords.length} bản ghi thanh toán đến kỳ ${period.period_number}`;
        
        toast({
          title: 'Thành công',
          description: paymentDescription,
        });
        
      } else {
        // Uncheck logic - chỉ cho phép uncheck kỳ gần nhất
        // Lấy ra ngày cuối cùng đã đóng tiền
        const latestPaidDate = await getLatestPaymentPaidDate(credit.id);
        if (latestPaidDate) {
          const latestPaidDateObj = new Date(latestPaidDate);
          const endDate = new Date(period.end_date.split('T')[0]);
          if (endDate.getTime() < latestPaidDateObj.getTime()) {
            toast({ variant: 'destructive', title: 'Ngày này đã được đóng lãi. Bạn có thể tải lại bảng để xem lại' });
            return;
          }
        }

        const checkedPeriods = periodsToDisplay.filter(p => 
          getEffectiveCheckedState(p)
        );
        
        checkedPeriods.sort((a, b) => b.period_number - a.period_number);
        
        if (checkedPeriods.length > 0 && checkedPeriods[0].period_number !== period.period_number) {
          // Revert optimistic update
          setOptimisticUpdates(prev => {
            const newUpdates = { ...prev };
            delete newUpdates[periodId];
            return newUpdates;
          });
          
          toast({
            variant: "destructive",
            title: "Không thể bỏ đánh dấu",
            description: `Bạn chỉ có thể bỏ đánh dấu kỳ ${checkedPeriods[0].period_number} (kỳ thanh toán gần nhất).`
          });
          return;
        }
        
        // Soft delete records trong khoảng thời gian của kỳ này
        const startDate = period.start_date.split('T')[0];
        const endDate = period.end_date.split('T')[0];
        
        const { data, error } = await supabase
          .from('credit_history')
          .update({ is_deleted: true, updated_by: userId, updated_at: new Date().toISOString()})
          .eq('credit_id', credit.id)
          .eq('transaction_type', 'payment')
          .eq('is_deleted', false)
          .gte('effective_date', startDate)
          .lte('effective_date', endDate + 'T23:59:59Z')
          .select();
        
        if (error) {
          throw new Error(error.message);
        }
        
        toast({
          title: 'Thành công',
          description: `Đã xóa ${data?.length || 0} bản ghi thanh toán cho kỳ ${period.period_number}`,
        });
      }
      
      // 2. Clear optimistic update after successful DB operation
      setOptimisticUpdates(prev => {
        const newUpdates = { ...prev };
        delete newUpdates[periodId];
        return newUpdates;
      });
      
      // 3. Background sync without disrupting UI
      setTimeout(() => {
        handleBackgroundSync();
        // Thêm delay để đảm bảo database đã xử lý xong
        setTimeout(() => {
          // Gọi callback để cập nhật financial summary ngay lập tức
          onPaymentUpdate?.();
        }, 500);
      }, 100);
      
    } catch (error) {
      console.error('Error handling payment records:', error);
      // 4. Revert optimistic update on error
      setOptimisticUpdates(prev => {
        const newUpdates = { ...prev };
        delete newUpdates[periodId];
        return newUpdates;
      });
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể xử lý bản ghi thanh toán',
        variant: 'destructive'
      });
    } finally {
      setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
      setIsProcessingCheckbox(false);
    }
  };

  // Hàm tính lãi cho khoảng thời gian tùy biến - RETURN PROMISE
  const calculateInterestForCustomPeriod = async (startDate: string, endDate: string): Promise<number> => {
    if (!credit?.id) return 0;
    
    try {
      const result = await calculateCustomPeriodInterest(credit.id, startDate, endDate);
      console.log(`Calculated interest for ${startDate} → ${endDate}:`, result);
      return result;
    } catch (err) {
      console.error('Error calculating interest:', err);
      return 0;
    }
  };

  // Xử lý submit form đóng lãi tùy biến
  const handleCustomPaymentSubmit = async (data: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    totalAmount: number;
  }) => {
    if (!credit?.id) return;

    try {
      // Import the new function
      const { saveCustomPaymentWithAmount } = await import('@/lib/Credits/save_custom_payment');
      
      await saveCustomPaymentWithAmount(credit.id, data);

      toast({
        title: "Thành công",
        description: `Đã ghi lịch sử đóng lãi phí tùy biến ${formatCurrency(data.interestAmount)} thành công`,
      });

      setShowPaymentForm(false);
      if (onDataChange) onDataChange();
      window.dispatchEvent(new Event('warnings-refresh'));
    } catch (error) {
      console.error('Error submitting custom payment:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Có lỗi xảy ra khi ghi lịch sử thanh toán"
      });
    }
  };

  // State để lưu ngày kết thúc kỳ cuối
  const [lastPaymentEndDate, setLastPaymentEndDate] = useState<string | null>(null);

  // Load ngày kết thúc kỳ cuối khi component mount
  useEffect(() => {
    async function loadLastPaymentEndDate() {
      if (!credit?.id) return;
      
      try {
        const endDate = await getLatestPaymentPaidDate(credit.id);
        setLastPaymentEndDate(endDate);
      } catch (err) {
        console.error('Error loading last payment end date:', err);
      }
    }
    
    loadLastPaymentEndDate();
  }, [credit?.id, onDataChange]); // Reload khi có thay đổi dữ liệu

  useEffect(() => {
    const hasOptimisticUpdates = Object.keys(optimisticUpdates).length > 0;
    onOptimisticStateChange?.(hasOptimisticUpdates);
  }, [optimisticUpdates, onOptimisticStateChange]);

  return (
    <div className="relative">
      {/* NEW: Background sync indicator */}
      {isBackgroundSyncing && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-20 flex items-center">
          <div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin mr-1"></div>
          Đang đồng bộ...
        </div>
      )}
      {/* Processing overlay - Hidden when optimistic updates are active */}
      {isProcessingCheckbox && Object.keys(optimisticUpdates).length === 0 && (
        <div className="absolute inset-0 bg-white bg-opacity-70 z-10 flex items-center justify-center">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-lg">
            <div className="flex items-center">
              <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-3"></div>
              <span className="text-blue-700 font-medium">Đang xử lý thanh toán...</span>
            </div>
          </div>
        </div>
      )}
      
      {/* UPDATED: Conditional loading - only show when no data exists */}
      {isGenerating && periodsToDisplay.length === 0 && (
        <div className="flex items-center justify-center p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
          <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-2"></div>
          <span className="text-blue-700">Đang tải...</span>
        </div>
      )}
      
      {/* Link mở form đóng lãi phí */}
      <div className="flex items-center mb-2 ml-1">
        <ChevronDown className="h-4 w-4 text-blue-600" />
        <a 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            if (!isProcessingCheckbox) {
              setShowPaymentForm(!showPaymentForm);
            }
          }}
          className={`text-blue-600 hover:underline ml-1 ${isProcessingCheckbox ? 'pointer-events-none opacity-50' : ''}`}
        >
          Đóng lãi phí tùy biến theo ngày
        </a>
      </div>

      {/* Form đóng lãi phí tùy biến */}
      {showPaymentForm && (
        <div className="mb-4">
          <PaymentForm
            onClose={() => setShowPaymentForm(false)}
            creditId={credit?.id}
            interestCalculator={calculateInterestForCustomPeriod}
            onSubmit={handleCustomPaymentSubmit}
            loanDate={credit?.loan_date}
            loanPeriod={credit?.loan_period}
            interestPeriod={credit?.interest_period}
            lastPaymentEndDate={lastPaymentEndDate}
            disabled={credit?.status === CreditStatus.CLOSED || credit?.status === CreditStatus.DELETED || isProcessingCheckbox}
          />
        </div>
      )}
      
      {/* Bảng hiển thị các kỳ thanh toán */}
      <div className="overflow-auto mt-2" style={{ maxHeight: '400px' }}>
        <table className="w-full border-collapse">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">STT</th>
            <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">Ngày</th>
            <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border">Số ngày</th>
            <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền lãi phí</th>
            <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khác</th>
            <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tổng lãi phí</th>
            <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khách trả</th>
            <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border w-10"></th>
          </tr>
        </thead>
        <tbody>
          {/* UPDATED: Always show periods if available, even during background refresh */}
          {periodsToDisplay.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-4 text-center text-gray-500">
                {loading || isGenerating ? "Đang tải dữ liệu..." : error ? error : "Không có dữ liệu"}
              </td>
            </tr>
          ) : (
            // UPDATED: Always show periods if available, even during background refresh
            periodsToDisplay.map((period, index) => {
              const expected = period.expected_amount || 0;
              const actual = period.actual_amount || period.expected_amount;
              const other = period.other_amount || 0;
              const total = expected + other;
              
              // UPDATED: Use effective checked state with optimistic updates
              const hasPayments = getEffectiveCheckedState(period);
              const isEditing = editingPeriodId === period.id || editingPeriodId === `temp-${period.period_number}`;
              const periodId = period.id || `temp-${period.period_number}`;
              const isLoading = loadingPeriods[periodId];
              const isDisabled = credit?.status === CreditStatus.CLOSED || credit?.status === CreditStatus.DELETED;
              
              // UPDATED: Find the earliest unpaid period using optimistic updates
              const earliestUnpaidIndex = periodsToDisplay.findIndex(p => 
                !getEffectiveCheckedState(p)
              );
              const isEarliestUnpaid = index === earliestUnpaidIndex;
              
              return (
                <tr key={period.id} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-center border">{period.period_number}</td>
                  <td className="px-2 py-2 text-center border">
                    {formatDate(period.start_date)} 
                    {' → '} 
                    {formatDate(period.end_date)}
                  </td>
                  <td className="px-2 py-2 text-center border">
                    {period.start_date && period.end_date ? 
                      calculateDaysBetween(new Date(period.start_date), new Date(period.end_date)) : 0
                    }
                  </td>
                  <td className="px-2 py-2 text-right border">
                    {formatCurrency(expected)}
                  </td>
                  <td className="px-2 py-2 text-right border">{formatCurrency(other)}</td>
                  <td className="px-2 py-2 text-right border">{formatCurrency(total)}</td>
                  <td className="px-2 py-2 text-right border">
                    {isEditing ? (
                      <div className="flex items-center justify-end space-x-1">
                        <input
                          type="text"
                          className="border rounded w-24 px-1 py-0.5 text-right text-sm"
                          value={formatNumberInput(paymentAmount)}
                          onChange={(e) => setPaymentAmount(parseFormattedNumber(e.target.value))}
                          autoFocus
                          onFocus={e => {
                            if (!paymentAmount || paymentAmount === 0) e.target.select();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCheckboxChange(period, true);
                            } else if (e.key === 'Escape') {
                              cancelEditing();
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button 
                          className="text-xs bg-blue-500 text-white px-1 rounded"
                          onClick={(e) => {
                            e.preventDefault();
                            handleCheckboxChange(period, true);
                          }}
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <span 
                        className={`${!hasPayments && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                        onClick={!hasPayments && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? () => startEditing(period) : undefined}
                      >
                        {formatCurrency(actual)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center border">
                    {isLoading ? (
                      <div className="flex justify-center">
                        <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
                      </div>
                    ) : (
                      <>
                        {(() => {
                          // UPDATED: Find all checked periods using optimistic updates
                          const checkedPeriods = periodsToDisplay.filter(p => 
                            getEffectiveCheckedState(p)
                          );
                          
                          // Sort by period_number to find the highest
                          checkedPeriods.sort((a, b) => b.period_number - a.period_number);
                          
                          // Check if current period is the latest checked period
                          const isLatestChecked = checkedPeriods.length > 0 && 
                            checkedPeriods[0].period_number === period.period_number;
                          
                          // If checked but not the latest checked period, show locked checkbox
                          if (hasPayments && !isLatestChecked) {
                            return (
                              <div className="flex items-center justify-center" title="Không thể bỏ đánh dấu kỳ này vì chưa phải kỳ gần nhất">
                                <div className="relative">
                                  <Checkbox 
                                    checked={true}
                                    disabled={true}
                                    className="opacity-60 cursor-not-allowed"
                                  />
                                  <span className="absolute -top-1 -right-1 text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                  </span>
                                </div>
                              </div>
                            );
                          } else {
                            // Regular checkbox for unchecked periods or the latest checked period
                            return (
                              <Checkbox 
                                checked={hasPayments} 
                                onCheckedChange={(checked) => handleCheckboxChange(period, !!checked)}
                                disabled={isDisabled || isProcessingCheckbox}
                              />
                            );
                          }
                        })()}
                      </>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}
