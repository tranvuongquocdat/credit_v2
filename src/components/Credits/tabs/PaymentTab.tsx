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
  onDataChange
}: PaymentTabProps) {
  // State for inline payment editing
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  // Add loading state for checkbox operations
  const [loadingPeriods, setLoadingPeriods] = useState<Record<string, boolean>>({});
  const [isProcessingCheckbox, setIsProcessingCheckbox] = useState(false);
  
  // State for generated periods from getExpectedMoney
  const [generatedPeriods, setGeneratedPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

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
            const periodPayments = paymentHistory.filter(payment => {
              const paymentDate = payment.effective_date?.split('T')[0] || '';
              const startDate = start_date.split('T')[0]; // Remove time part
              const endDate = end_date.split('T')[0];     // Remove time part
              
              console.log('Comparing:', paymentDate, 'between', startDate, 'and', endDate);
              return paymentDate >= startDate && paymentDate <= endDate;
            });
            
            actualAmount = periodPayments.reduce((sum, payment) => {
              return sum + (payment.credit_amount || 0) - (payment.debit_amount || 0);
            }, 0);
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

  const startEditing = (period: CreditPaymentPeriod) => {
    // Don't allow editing if period already has payments or if processing
    const hasPayments = period.id && period.id.startsWith('db-') && (period.actual_amount || 0) > 0;
    if (hasPayments || isProcessingCheckbox) return;
    
    // Only allow editing the earliest unpaid period
    const earliestUnpaidIndex = periodsToDisplay.findIndex(p => 
      (!p.id || p.id.startsWith('generated-')) || (p.id.startsWith('db-') && (p.actual_amount || 0) === 0)
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
  
  // Handle saving payment - updated to adjust last day amount
  const savePayment = async (period: CreditPaymentPeriod) => {
    console.log('Saving payment for period:', period);
    if (!credit?.id) return;
    
    try {
      const isCalculatedPeriod = !period.id || period.id.startsWith('generated-');
      
      // Calculate daily amounts with adjustment for last day
      const startDate = new Date(period.start_date);
      const endDate = new Date(period.end_date);
      const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      // Calculate daily amount and adjustment for last day
      const dailyAmount = Math.floor(paymentAmount / totalDays);
      const lastDayAdjustment = paymentAmount - (dailyAmount * totalDays);
      
      console.log(`Payment distribution: ${totalDays} days, ${dailyAmount} per day, last day adjustment: ${lastDayAdjustment}`);
      
      // Prepare daily records with adjusted amounts
      const dailyRecords = [];
      
      for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + dayOffset);
        
        // Determine date_status
        let dateStatus: string | null = null;
        if (totalDays === 1) {
          dateStatus = 'only';
        } else if (dayOffset === 0) {
          dateStatus = 'start';
        } else if (dayOffset === totalDays - 1) {
          dateStatus = 'end';
        }
        
        // Calculate amount for this day
        let dayAmount = dailyAmount;
        if (dayOffset === totalDays - 1) {
          // Last day gets the adjustment
          dayAmount = dailyAmount + lastDayAdjustment;
        }
        
        const dailyRecord = {
          credit_id: credit.id,
          transaction_type: 'payment' as const,
          effective_date: currentDate.toISOString(),
          date_status: dateStatus,
          credit_amount: dayAmount,
          debit_amount: 0,
          description: `Thanh toán ngày ${dayOffset + 1}/${totalDays} của kỳ ${period.period_number}`,
        };
        
        dailyRecords.push(dailyRecord);
        console.log(`Day ${dayOffset + 1}: ${currentDate.toISOString().split('T')[0]}, amount: ${dayAmount}, status: ${dateStatus}`);
      }
      
      // Insert daily records into credit_history
      const { data, error } = await supabase
        .from('credit_history')
        .insert(dailyRecords)
        .select();
      
      if (error) {
        throw new Error(error.message);
      }
      
      console.log('Inserted', dailyRecords.length, 'daily payment records with custom amounts');
      
      toast({
        title: 'Thành công',
        description: `Đã lưu thanh toán ${formatCurrency(paymentAmount)} cho kỳ ${period.period_number}`,
      });
      
      // Clear editing state
      setEditingPeriodId(null);
      
      // Reload the data to reflect changes
      if (onDataChange) {
        onDataChange();
      }
    } catch (error) {
      console.error('Error saving payment:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi lưu thanh toán. Vui lòng thử lại."
      });
    }
  };
  
  // Updated checkbox handler - add better debugging and fix potential issues
  const handleCheckboxChange = async (period: CreditPaymentPeriod, checked: boolean, index: number) => {
    if (!credit?.id || isProcessingCheckbox) return;
    
    // Set global loading state
    setIsProcessingCheckbox(true);
    
    // Set loading state for this period
    const periodId = period.id || `temp-${period.period_number}`;
    setLoadingPeriods(prev => ({ ...prev, [periodId]: true }));
    
    try {
      if (checked) {
        // Check if there are any unchecked previous periods
        const periodsToCheck = [];
        
        // Add current period
        periodsToCheck.push(period);
        
        // Add all previous unchecked periods
        for (let i = 0; i < index; i++) {
          const prevPeriod = periodsToDisplay[i];
          const prevPeriodId = prevPeriod.id || `temp-${prevPeriod.period_number}`;
          const isPrevPeriodChecked = Boolean(prevPeriod.id && prevPeriod.id.startsWith('db-') && (prevPeriod.actual_amount || 0) > 0);
          
          // If previous period is not checked, add it to the list
          if (!isPrevPeriodChecked) {
            periodsToCheck.push(prevPeriod);
            // Set loading state for previous period
            setLoadingPeriods(prev => ({ ...prev, [prevPeriodId]: true }));
          }
        }
        
        console.log(`Processing ${periodsToCheck.length} periods: current period ${period.period_number} and ${periodsToCheck.length - 1} previous periods`);
        
        // Process all periods that need to be checked
        for (const periodToCheck of periodsToCheck) {
          console.log('Inserting daily payment records for period:', periodToCheck.period_number);
          
          // Calculate all days in this period
          const startDate = new Date(periodToCheck.start_date);
          const endDate = new Date(periodToCheck.end_date);
          const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          console.log(`Period ${periodToCheck.period_number}: ${totalDays} days from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
          
          // Use expected amount for checkbox payment (equal distribution)
          const totalAmount = periodToCheck.expected_amount || 0;
          const dailyAmount = Math.floor(totalAmount / totalDays);
          const lastDayAdjustment = totalAmount - (dailyAmount * totalDays);
          
          console.log(`Expected distribution: ${totalDays} days, ${dailyAmount} per day, last day adjustment: ${lastDayAdjustment}`);
          
          // Prepare daily records to insert
          const dailyRecords = [];
          
          for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + dayOffset);
            
            // Determine date_status
            let dateStatus: string | null = null; // Default for middle days
            if (totalDays === 1) {
              dateStatus = 'only';
            } else if (dayOffset === 0) {
              dateStatus = 'start';
            } else if (dayOffset === totalDays - 1) {
              dateStatus = 'end';
            }
            
            // Calculate amount for this day
            let dayAmount = dailyAmount;
            if (dayOffset === totalDays - 1) {
              // Last day gets the adjustment
              dayAmount = dailyAmount + lastDayAdjustment;
            }
            
            const dailyRecord = {
              credit_id: credit.id,
              transaction_type: 'payment' as const,
              effective_date: currentDate.toISOString(),
              date_status: dateStatus,
              credit_amount: dayAmount,
              debit_amount: 0,
              description: `Thanh toán ngày ${dayOffset + 1}/${totalDays} của kỳ ${periodToCheck.period_number}`,
              is_deleted: false
            };
            
            dailyRecords.push(dailyRecord);
          }
          
          // Insert daily records into credit_history
          const { data, error } = await supabase
            .from('credit_history')
            .insert(dailyRecords)
            .select();
          
          if (error) {
            throw new Error(error.message);
          }
          
          console.log('Inserted', dailyRecords.length, 'daily payment records for period', periodToCheck.period_number);
          
          // Clear loading state for this period
          const currentPeriodId = periodToCheck.id || `temp-${periodToCheck.period_number}`;
          setLoadingPeriods(prev => ({ ...prev, [currentPeriodId]: false }));
        }
        
        toast({
          title: 'Thành công',
          description: `Đã thanh toán ${periodsToCheck.length} kỳ (kỳ ${periodsToCheck.map(p => p.period_number).join(', ')})`,
        });
        
      } else {
        // Check if this is the latest checked period
        // Find all checked periods
        const checkedPeriods = periodsToDisplay.filter(p => 
          p.id && p.id.startsWith('db-') && (p.actual_amount || 0) > 0
        );
        
        // Sort by period_number to find the highest
        checkedPeriods.sort((a, b) => b.period_number - a.period_number);
        
        // Check if current period is the latest checked period
        if (checkedPeriods.length > 0 && checkedPeriods[0].period_number !== period.period_number) {
          console.warn(`Cannot uncheck period ${period.period_number} because it's not the latest checked period. Latest is ${checkedPeriods[0].period_number}`);
          toast({
            variant: "destructive",
            title: "Không thể bỏ đánh dấu",
            description: `Bạn chỉ có thể bỏ đánh dấu kỳ ${checkedPeriods[0].period_number} (kỳ thanh toán gần nhất).`
          });
          return;
        }
        
        console.log('Marking daily payment records as deleted for period:', period.period_number);
        
        // Mark daily records for this period as deleted (soft delete)
        const startDate = period.start_date.split('T')[0];
        const endDate = period.end_date.split('T')[0];
        
        console.log('Deleting records between:', startDate, 'and', endDate);
        
        // First, check what records exist
        const { data: existingRecords, error: checkError } = await supabase
          .from('credit_history')
          .select('id, effective_date, is_deleted')
          .eq('credit_id', credit.id)
          .eq('transaction_type', 'payment')
          .gte('effective_date', startDate)
          .lte('effective_date', endDate + 'T23:59:59Z');
          
        if (checkError) {
          console.error('Error checking existing records:', checkError);
          throw new Error(checkError.message);
        }
        
        console.log('Found existing records:', existingRecords);
        
        // Update records to is_deleted = true
        const { data, error } = await supabase
          .from('credit_history')
          .update({is_deleted: true})
          .eq('credit_id', credit.id)
          .eq('transaction_type', 'payment')
          .eq('is_deleted', false)
          .gte('effective_date', startDate)
          .lte('effective_date', endDate + 'T23:59:59Z')
          .select();
        
        if (error) {
          console.error('Update error:', error);
          throw new Error(error.message);
        }
        
        console.log('Updated records:', data);
        console.log('Number of records updated:', data?.length || 0);
        
        if (!data || data.length === 0) {
          console.warn('No records were updated!');
          // Try alternative approach - remove the is_deleted filter
          const { data: altData, error: altError } = await supabase
            .from('credit_history')
            .update({ is_deleted: true })
            .eq('credit_id', credit.id)
            .eq('transaction_type', 'payment')
            .gte('effective_date', startDate + 'T00:00:00Z')
            .lte('effective_date', endDate + 'T23:59:59Z')
            .select();
          
          if (altError) {
            throw new Error(altError.message);
          }
          
          console.log('Alternative update result:', altData);
        }
        
        toast({
          title: 'Thành công',
          description: `Đã đánh dấu xóa ${data?.length || 0} bản ghi thanh toán cho kỳ ${period.period_number}`,
        });
      }
      
      // Trigger data change to regenerate periods
      if (onDataChange) onDataChange();
      
    } catch (error) {
      console.error('Error handling daily payment records:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể xử lý bản ghi thanh toán hàng ngày',
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

  return (
    <div className="relative">
      {/* Processing overlay */}
      {isProcessingCheckbox && (
        <div className="absolute inset-0 bg-white bg-opacity-70 z-10 flex items-center justify-center">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-lg">
            <div className="flex items-center">
              <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-3"></div>
              <span className="text-blue-700 font-medium">Đang xử lý thanh toán...</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading indicators */}
      {isGenerating && (
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
          {loading ? (
            <tr>
              <td colSpan={8} className="py-4 text-center text-gray-500">
                Đang tải dữ liệu...
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={8} className="py-4 text-center text-red-500">
                {error}
              </td>
            </tr>
          ) : periodsToDisplay.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-4 text-center text-gray-500">
                Đang tạo dữ liệu từ getExpectedMoney...
              </td>
            </tr>
          ) : (
            // Hiển thị dữ liệu từ getExpectedMoney với chức năng editable
            periodsToDisplay.map((period, index) => {
              const expected = period.expected_amount || 0;
              const actual = period.actual_amount || period.expected_amount;
              const other = period.other_amount || 0;
              const total = expected + other;
              
              // Updated logic to determine if period has payments in DB
              const hasPayments = Boolean(period.id && period.id.startsWith('db-') && actual > 0);
              const isEditing = editingPeriodId === period.id || editingPeriodId === `temp-${period.period_number}`;
              const periodId = period.id || `temp-${period.period_number}`;
              const isLoading = loadingPeriods[periodId];
              const isDisabled = credit?.status === CreditStatus.CLOSED || credit?.status === CreditStatus.DELETED;
              
              // Find the earliest unpaid period (first period with generated- id or db- id with no actual amount)
              const earliestUnpaidIndex = periodsToDisplay.findIndex(p => 
                (!p.id || p.id.startsWith('generated-')) || (p.id.startsWith('db-') && (p.actual_amount || 0) === 0)
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              savePayment(period);
                            } else if (e.key === 'Escape') {
                              cancelEditing();
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button 
                          className="text-xs bg-blue-500 text-white px-1 rounded"
                          onClick={() => savePayment(period)}
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
                          // Find all checked periods
                          const checkedPeriods = periodsToDisplay.filter(p => 
                            p.id && p.id.startsWith('db-') && (p.actual_amount || 0) > 0
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
                                onCheckedChange={(checked) => handleCheckboxChange(period, !!checked, index)}
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
