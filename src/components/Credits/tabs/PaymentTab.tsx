'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PaymentForm } from '../PaymentForm';
import { CreditWithCustomer, CreditStatus } from '@/models/credit';
import { CreditPaymentPeriod } from '@/models/credit-payment';
import { toast } from '@/components/ui/use-toast';
import { PrincipalChange, calculateInterestWithPrincipalChanges } from '@/lib/interest-calculator';
import { getPrincipalChangesForCredit } from '@/lib/credit-principal-changes';

type PaymentTabProps = {
  credit: CreditWithCustomer | null;
  paymentPeriods: CreditPaymentPeriod[];
  combinedPaymentPeriods: CreditPaymentPeriod[];
  loading: boolean;
  error: string | null;
  showPaymentForm: boolean;
  setShowPaymentForm: (show: boolean) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  calculateDaysBetween: (start: Date, end: Date) => number;
  onDataChange?: () => void;
  principalChanges?: PrincipalChange[];
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
  paymentPeriods,
  combinedPaymentPeriods,
  loading,
  error,
  showPaymentForm,
  setShowPaymentForm,
  formatCurrency,
  formatDate,
  calculateDaysBetween,
  onDataChange,
  principalChanges = [] // Default to empty array
}: PaymentTabProps) {
  // State for inline payment editing
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [localPrincipalChanges, setLocalPrincipalChanges] = useState<PrincipalChange[]>(principalChanges);
  // Add loading state for checkbox operations
  const [loadingPeriods, setLoadingPeriods] = useState<Record<string, boolean>>({});
  const [isProcessingCheckbox, setIsProcessingCheckbox] = useState(false); // Global loading state
  
  // State for recalculated periods based on new logic
  const [recalculatedPeriods, setRecalculatedPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [principalChangesLoaded, setPrincipalChangesLoaded] = useState(false);
  const [calculationCount, setCalculationCount] = useState(0);
  
  // Use ref to store the calculation function to avoid dependency issues
  const recalculateRef = useRef<(() => Promise<void>) | null>(null);
  
  // Load principal changes if not provided
  useEffect(() => {
    if (principalChanges && principalChanges.length > 0) {
      setLocalPrincipalChanges(principalChanges);
      setPrincipalChangesLoaded(true);
      return;
    }

    async function loadPrincipalChanges() {
      if (!credit?.id) return;

      try {
        const { data, error } = await getPrincipalChangesForCredit(credit.id);
        
        if (error) {
          console.error('Error loading principal changes:', error);
          return;
        }
        
        console.log('Loaded principal changes:', data);
        console.log('Credit:', credit);
        
        setLocalPrincipalChanges(data || []);
        setPrincipalChangesLoaded(true);
      } catch (err) {
        console.error('Error fetching principal changes:', err);
      }
    }

    loadPrincipalChanges();
  }, [credit?.id, principalChanges]);

  // Calculate interest with principal changes
  const calculateInterestForPeriod = useCallback((startDate: string, endDate: string): number => {
    if (!credit) return 0;
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Debug principal changes
      console.log('----DEBUG CALCULATE INTEREST----');
      console.log('Period:', startDate, 'to', endDate);
      console.log('Principal changes:', localPrincipalChanges);
      console.log('Filtered changes:', localPrincipalChanges.filter(change => new Date(change.date) < start));
      
      return calculateInterestWithPrincipalChanges(
        credit,
        start,
        end,
        localPrincipalChanges
      );
    } catch (err) {
      console.error('Error calculating interest with principal changes:', err);
      return 0;
    }
  }, [credit, localPrincipalChanges]);

  // Simplified function to calculate periods - only generate new periods after last paid period
  const recalculatePeriodsWithHistory = async () => {
    if (!credit?.id) return;

    console.log('🔄 Starting simplified calculation with:', {
      creditId: credit.id,
      currentLoanAmount: credit.loan_amount,
      paymentPeriodsCount: paymentPeriods.length,
      calculationNumber: calculationCount + 1
    });
    
    // Debug principal changes
    console.log('DEBUG: Principal changes for recalculation:', localPrincipalChanges);
    if (localPrincipalChanges.length > 0) {
      const changeDate = new Date(localPrincipalChanges[0].date);
      console.log('DEBUG: First principal change date:', changeDate.toISOString());
      console.log('DEBUG: First principal change is for kỳ 8?:', changeDate.getDate() === 18 && changeDate.getMonth() === 5); // 18/06 (month 5 = June)
    }

    setCalculationCount(prev => prev + 1);
    setIsRecalculating(true);

    try {
      // 1. Get existing periods from DB (keep as-is)
      const existingPeriods = paymentPeriods || [];
      
      // 2. Find the start date for next period
      let nextStartDate: Date;
      let nextPeriodNumber = 1;
      
      if (existingPeriods.length > 0) {
        // Start from day after last period
        const lastPeriod = existingPeriods.sort((a, b) => a.period_number - b.period_number)[existingPeriods.length - 1];
        nextStartDate = new Date(lastPeriod.end_date);
        nextStartDate.setDate(nextStartDate.getDate() + 1);
        nextPeriodNumber = lastPeriod.period_number + 1;
      } else {
        // No existing periods, start from loan date
        nextStartDate = new Date(credit.loan_date);
      }

      // 3. Calculate loan end date
      const loanEndDate = new Date(credit.loan_date);
      loanEndDate.setDate(loanEndDate.getDate() + credit.loan_period - 1);

      // 4. Generate new periods using current loan_amount
      const newPeriods: CreditPaymentPeriod[] = [...existingPeriods];
      const interestPeriod = credit.interest_period || 30;

      while (nextStartDate <= loanEndDate && newPeriods.length < 100) {
        const periodEndDate = new Date(nextStartDate);
        periodEndDate.setDate(nextStartDate.getDate() + interestPeriod - 1);
        
        // Don't exceed loan end date
        if (periodEndDate > loanEndDate) {
          periodEndDate.setTime(loanEndDate.getTime());
        }

        // Calculate days in this period
        const daysInPeriod = Math.floor((periodEndDate.getTime() - nextStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        // Calculate interest using calculateInterestForPeriod to account for principal changes
        const expectedAmount = calculateInterestForPeriod(
          nextStartDate.toISOString(),
          periodEndDate.toISOString()
        );
        
        console.log(`Period ${nextPeriodNumber}: ${nextStartDate.toISOString()} to ${periodEndDate.toISOString()}, Expected: ${expectedAmount}`);

        const newPeriod: CreditPaymentPeriod = {
          id: `calculated-${nextPeriodNumber}`,
          credit_id: credit.id,
          period_number: nextPeriodNumber,
          start_date: nextStartDate.toISOString(),
          end_date: periodEndDate.toISOString(),
          expected_amount: expectedAmount,
          actual_amount: 0,
          payment_date: null,
          notes: null,
          other_amount: 0,
          is_temporary: false
        };

        newPeriods.push(newPeriod);
        nextPeriodNumber++;

        // Prepare for next period
        nextStartDate = new Date(periodEndDate);
        nextStartDate.setDate(periodEndDate.getDate() + 1);

        // Stop if next start date exceeds loan end date
        if (nextStartDate > loanEndDate) break;
      }

      // Sort by period number and set result
      newPeriods.sort((a, b) => a.period_number - b.period_number);
      setRecalculatedPeriods(newPeriods);

      console.log('✅ Simplified calculation completed:', {
        totalPeriods: newPeriods.length,
        existingPeriods: existingPeriods.length,
        newGeneratedPeriods: newPeriods.length - existingPeriods.length
      });

    } catch (error) {
      console.error('Error in simplified calculation:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi tính toán các kỳ thanh toán"
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  // Assign function to ref
  recalculateRef.current = recalculatePeriodsWithHistory;

  // Effect to recalculate periods when credit or payment periods change
  useEffect(() => {
    // Simplified: only need credit and paymentPeriods
    if (credit?.id) {
      console.log('Triggering simplified recalculation:', {
        creditId: credit.id,
        paymentPeriodsCount: paymentPeriods.length
      });
      
      // Debounce to prevent multiple calculations
      const timeoutId = setTimeout(() => {
        recalculateRef.current?.();
      }, 300); // Reduced timeout
      
      return () => clearTimeout(timeoutId);
    }
  }, [credit?.id, paymentPeriods]);

  // Use recalculated periods if available, otherwise use original combined periods
  const periodsToDisplay = recalculatedPeriods.length > 0 ? recalculatedPeriods : combinedPaymentPeriods;
  console.log(recalculatedPeriods)
  // Start editing a payment
  const startEditing = (period: CreditPaymentPeriod) => {
    // Don't edit periods that are already in DB or when processing checkbox
    if ((period.id && !period.id.startsWith('calculated-') && !period.id.startsWith('temp-')) || isProcessingCheckbox) return;
    
    // Only allow editing the earliest unpaid period
    const earliestUnpaidIndex = periodsToDisplay.findIndex(p => 
      !p.id || p.id.startsWith('calculated-') || p.id.startsWith('temp-')
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
  
  // Handle saving payment
  const savePayment = async (period: CreditPaymentPeriod) => {
    console.log('Saving payment for period:', period);
    if (!credit?.id) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log(today)
      const isCalculatedPeriod = !period.id || period.id.startsWith('calculated-');
      console.log(paymentAmount)
      
      // Import dynamically to prevent import cycle
      const { savePaymentWithOtherAmount } = await import('@/lib/credit-payment');
      
      // Save the payment (debt_amount is automatically updated inside this function)
      await savePaymentWithOtherAmount(
        credit.id,
        period,
        paymentAmount,
        period.other_amount || 0,
        isCalculatedPeriod
      );
      
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
  
  // Handler for checkbox change
  const handleCheckboxChange = async (period: CreditPaymentPeriod, checked: boolean, index: number) => {
    if (!credit?.id || isProcessingCheckbox) return; // Prevent concurrent operations
    
    // Set global loading state
    setIsProcessingCheckbox(true);
    
    // Set loading state for this period
    const periodId = period.id || `temp-${period.period_number}`;
    setLoadingPeriods(prev => ({ ...prev, [periodId]: true }));
    
    try {
      // Import the new API function
      const { markPaymentPeriods } = await import('@/lib/credit-payment-api');
      
      if (checked) {
        // Find all unchecked periods from the oldest up to this one
        const periodsToCheck = [];
        
        // Go through all periods up to the current one (inclusive)
        for (let i = 0; i <= index; i++) {
          const p = periodsToDisplay[i];
          // Only include periods that don't have any payment in DB yet
          if (p.id.startsWith('calculated-') || p.id.startsWith('temp-')) {
            periodsToCheck.push(p);
          }
        }
        
        // If no periods to check, exit early
        if (periodsToCheck.length === 0) {
          setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
          return;
        }
        
        // Use the new API to mark periods
        const result = await markPaymentPeriods(credit.id, periodsToCheck, 'mark');
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to mark payment periods');
        }
        
        // Check if any periods had issues
        const hasErrors = result.processed_periods?.some(p => p.status === 'error');
        const alreadyPaidCount = result.processed_periods?.filter(p => p.status === 'already_paid').length || 0;
        const autoCreatedCount = result.processed_periods?.filter(p => p.status === 'auto_created').length || 0;
        const autoUpdatedCount = result.processed_periods?.filter(p => p.status === 'auto_updated').length || 0;
        
        if (hasErrors) {
          const errorPeriods = result.processed_periods?.filter(p => p.status === 'error') || [];
          console.error('Some periods had errors:', errorPeriods);
          toast({
            variant: "destructive",
            title: "Một số kỳ gặp lỗi",
            description: `${errorPeriods.length} kỳ không thể xử lý. Vui lòng thử lại.`
          });
        }
        
        // Show success message with auto-fill info
        let description = 'Đã đánh dấu các kỳ là đã thanh toán';
        const additionalInfo = [];
        
        if (alreadyPaidCount > 0) {
          additionalInfo.push(`${alreadyPaidCount} kỳ đã được thanh toán trước đó`);
        }
        if (autoCreatedCount > 0) {
          additionalInfo.push(`${autoCreatedCount} kỳ được tạo tự động`);
        }
        if (autoUpdatedCount > 0) {
          additionalInfo.push(`${autoUpdatedCount} kỳ được cập nhật tự động`);
          }
        
        if (additionalInfo.length > 0) {
          description += ` (${additionalInfo.join(', ')})`;
        }
        
        toast({
          title: 'Thành công',
          description,
        });
        
        // Trigger data change
        if (onDataChange) onDataChange();
        
      } else {
        // Find all checked periods from this one to the newest for unmarking
        const periodsToUncheck = [];
        
        // Check if any later periods have been paid (validation)
        const laterPeriods = periodsToDisplay.slice(index + 1);
        const anyLaterPeriodPaid = laterPeriods.some(
          (p: CreditPaymentPeriod) => p && p.id && !p.id.startsWith('calculated-') && !p.id.startsWith('temp-')
        );

        if (anyLaterPeriodPaid) {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: "Không thể bỏ đánh dấu kỳ này vì có kỳ sau đã được thanh toán.",
          });
          setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
          return;
        }
        
        // Go through all periods from the current one to the end
        for (let i = periodsToDisplay.length - 1; i >= index; i--) {
          const p = periodsToDisplay[i];
          // Include all periods that are in DB
          if (p.id && !p.id.startsWith('calculated-') && !p.id.startsWith('temp-')) {
            periodsToUncheck.push(p);
          }
        }
        
        // If no periods to uncheck, exit early
        if (periodsToUncheck.length === 0) {
          setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
          return;
        }
        
        // Use the new API to unmark periods
        const result = await markPaymentPeriods(credit.id, periodsToUncheck, 'unmark');
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to unmark payment periods');
        }
        
        // Check for validation errors
        const cannotUnmarkCount = result.processed_periods?.filter(p => 
          p.status === 'cannot_unmark_has_later_payments'
        ).length || 0;
        
        if (cannotUnmarkCount > 0) {
          toast({
            variant: "destructive",
            title: "Không thể bỏ đánh dấu",
            description: `${cannotUnmarkCount} kỳ không thể bỏ đánh dấu vì có kỳ sau đã được thanh toán.`
          });
        } else {
        toast({
          title: 'Thành công',
          description: 'Đã đánh dấu các kỳ là chưa thanh toán',
        });
        }
        
        // Trigger data change
        if (onDataChange) onDataChange();
      }
    } catch (error) {
      console.error('Error changing payment status:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể thay đổi trạng thái thanh toán',
        variant: 'destructive'
      });
    } finally {
      setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
      setIsProcessingCheckbox(false);
    }
  };

  return (
    <div>
      {/* Loading indicator when recalculating */}
      {isRecalculating && (
        <div className="flex items-center justify-center p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
          <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-2"></div>
          <span className="text-blue-700">Đang tính toán lại các kỳ thanh toán...</span>
        </div>
      )}
      
      {/* Loading indicator when processing checkbox */}
      {isProcessingCheckbox && (
        <div className="flex items-center justify-center p-4 mb-4 bg-orange-50 border border-orange-200 rounded">
          <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-orange-600 animate-spin mr-2"></div>
          <span className="text-orange-700">Đang xử lý thanh toán...</span>
        </div>
      )}
      
      {/* Link mở form đóng lãi phí */}
      <div className="flex items-center mb-2 ml-1">
        <ChevronDown className="h-4 w-4 text-blue-600" />
        <a 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            setShowPaymentForm(!showPaymentForm);
          }}
          className="text-blue-600 hover:underline ml-1"
        >
          Đóng lãi phí tùy biến theo ngày
        </a>
      </div>
      
      {/* Form đóng lãi phí */}
      {showPaymentForm && credit && (
        <div className="border p-4 rounded mb-4">
          <PaymentForm 
            onClose={() => setShowPaymentForm(false)}
            disabled={credit.status === CreditStatus.CLOSED}
            onSubmit={async (data) => {
              try {
              console.log('Payment data submitted:', data);
                
                // Calculate interest considering principal changes
                const interestAmount = calculateInterestForPeriod(
                  data.startDate,
                  data.endDate
                );
                
                // Import the function dynamically to prevent import cycle
                const { savePaymentWithOtherAmount } = await import('@/lib/credit-payment');
                
                await savePaymentWithOtherAmount(
                  credit.id,
                  {
                    period_number: periodsToDisplay.filter(p => p.actual_amount >= p.expected_amount).length + 1, // Custom payment
                    start_date: data.startDate,
                    end_date: data.endDate,
                    expected_amount: interestAmount,
                    other_amount: data.otherAmount,
                    actual_amount: data.totalAmount
                  },
                  interestAmount,
                  data.otherAmount,
                  true // isCalculatedPeriod
                );
                
                toast({
                  title: "Thành công",
                  description: "Đã cập nhật khoản thanh toán thành công",
                });
                
              setShowPaymentForm(false);
              if (onDataChange) onDataChange();
              } catch (err) {
                console.error('Error submitting payment:', err);
                toast({
                  variant: "destructive",
                  title: "Lỗi",
                  description: "Có lỗi xảy ra khi lưu thanh toán. Vui lòng thử lại sau."
                });
              }
            }}
            interestCalculator={(startDate, endDate) => {
              // Function to calculate interest based on dates
              return calculateInterestForPeriod(startDate, endDate);
            }}
            creditId={credit.id}
            // Truyền thêm các thông tin về kỳ thanh toán
            loanDate={credit.loan_date}
            loanPeriod={credit.loan_period}
            interestPeriod={credit.interest_period}
            // Truyền thông tin về kỳ thanh toán cuối cùng ĐÃ THANH TOÁN
            lastPaymentEndDate={(() => {
              // Tìm kỳ cuối cùng đã thanh toán
              const paidPeriods = periodsToDisplay.filter(
                p => p.actual_amount >= p.expected_amount
              );
              
              // Nếu có kỳ đã thanh toán, trả về ngày kết thúc của kỳ cuối cùng
              if (paidPeriods.length > 0) {
                return paidPeriods[paidPeriods.length - 1].end_date;
              }
              
              // Nếu không có kỳ nào đã thanh toán, trả về undefined để sử dụng loan_date
              return undefined;
            })()}
          />
        </div>
      )}
      
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
                Chưa có dữ liệu thanh toán
              </td>
            </tr>
          ) : (
            // Hiển thị kết hợp của dữ liệu tính toán trước và dữ liệu thực từ database
            periodsToDisplay.map((period, index) => {
              const expected = period.expected_amount || 0;
              const actual = period.actual_amount || (period.expected_amount || 0) + (period.other_amount || 0);
              const other = period.other_amount || 0;
              const total = expected + other;
              const isInDB = period.id && !period.id.startsWith('calculated-') && !period.id.startsWith('temp-'); // Kỳ có trong DB
              const isEditing = editingPeriodId === period.id || editingPeriodId === `temp-${period.period_number}`;
              const periodId = period.id || `temp-${period.period_number}`;
              const isLoading = loadingPeriods[periodId];
              const isDisabled = credit?.status === CreditStatus.CLOSED;
              
              // Find the earliest unpaid period (first period not in DB)
              const earliestUnpaidIndex = periodsToDisplay.findIndex(p => 
                !p.id || p.id.startsWith('calculated-') || p.id.startsWith('temp-')
              );
              const isEarliestUnpaid = index === earliestUnpaidIndex;
              
              return (
                <tr key={periodId} className="hover:bg-gray-50">
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
                  <td className="px-2 py-2 text-right border">{formatCurrency(expected)}</td>
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
                        className={`${!isInDB && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                        onClick={!isInDB && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? () => startEditing(period) : undefined}
                      >
                        {formatCurrency(actual).replace('₫', '')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center border">
                    {isLoading ? (
                      <div className="flex justify-center">
                        <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
                      </div>
                    ) : (
                      <Checkbox 
                        checked={!!isInDB} 
                        onCheckedChange={(checked) => handleCheckboxChange(period, !!checked, index)}
                        disabled={isDisabled || isProcessingCheckbox}
                      />
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
