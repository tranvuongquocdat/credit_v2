'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PawnPaymentForm } from '../PawnPaymentForm';
import { PawnWithCustomerAndCollateral, PawnStatus } from '@/models/pawn';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { getPawnPaymentHistory } from '@/lib/Pawns/payment_history';
import { 
  calculateCustomPeriodInterest, 
} from '@/lib/Pawns/save_custom_payment';
import { getLatestPaymentPaidDate } from '@/lib/Pawns/get_latest_payment_paid_date';
import { getExpectedMoney } from '@/lib/Pawns/get_expected_money';
import { convertFromHistoryToTimeArrayWithStatus } from '@/lib/Pawns/convert_from_history_to_time_array';
import { getCurrentUser } from '@/lib/auth';

type PaymentTabProps = {
  pawn: PawnWithCustomerAndCollateral | null;
  loading: boolean;
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
  pawn,
  loading,
  error,
  showPaymentForm,
  setShowPaymentForm,
  formatCurrency,
  formatDate,
  calculateDaysBetween,
  onDataChange
}: PaymentTabProps) {
  // Add loading state for checkbox operations
  const [loadingPeriods, setLoadingPeriods] = useState<Record<string, boolean>>({});
  const [isProcessingCheckbox, setIsProcessingCheckbox] = useState(false);
  
  // State for generated periods from getExpectedMoney
  const [generatedPeriods, setGeneratedPeriods] = useState<PawnPaymentPeriod[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney
  useEffect(() => {
    async function generatePeriodsFromExpectedMoney() {
      if (!pawn?.id) return;

      setIsGenerating(true);
      try {
        console.log('🔄 Generating pawn periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney');
        
        // 1. Get payment history from database - filter out deleted records
        const allPaymentHistory = await getPawnPaymentHistory(pawn.id);
        const paymentHistory = allPaymentHistory.filter(record => !record.is_deleted);
        console.log('Payment history from DB:', paymentHistory.length, 'active records (', allPaymentHistory.length, 'total)');
        
        // 2. Get daily interest amounts using getExpectedMoney
        const dailyAmounts = await getExpectedMoney(pawn.id);
        console.log('Daily amounts from getExpectedMoney:', dailyAmounts.length, 'days');
        
        // 3. Calculate loan end date
        const loanStartDate = pawn.loan_date;
        const startDate = new Date(loanStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
        const loanEndDate = endDate.toISOString().split('T')[0];
        
        console.log('Loan period:', loanStartDate, '→', loanEndDate);
        
        // 4. Use convertFromHistoryToTimeArrayWithStatus to get periods and statuses
        const interestPeriod = pawn.interest_period || 30;
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
        const allPeriods: PawnPaymentPeriod[] = [];
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
          
          // Calculate actual amount based on payment history
          let actualAmount = 0;
          if (isChecked) {
            const periodPayments = paymentHistory.filter(payment => {
              const paymentDate = payment.effective_date?.split('T')[0] || '';
              const startDate = start_date.split('T')[0];
              const endDate = end_date.split('T')[0];
              
              return paymentDate >= startDate && paymentDate <= endDate;
            });
            
            actualAmount = periodPayments.reduce((sum, payment) => {
              return sum + (payment.credit_amount || 0) - (payment.debit_amount || 0);
            }, 0);
          }
          
          const newPeriod: PawnPaymentPeriod = {
            id: isChecked ? `db-${periodNumber}` : `generated-${periodNumber}`,
            pawn_id: pawn.id,
            period_number: periodNumber,
            start_date: periodStartDate.toISOString(),
            end_date: periodEndDate.toISOString(),
            expected_amount: Math.round(expectedAmount),
            actual_amount: Math.round(actualAmount),
            payment_date: isChecked ? end_date : null,
            notes: null,
            other_amount: 0
          };
          
          allPeriods.push(newPeriod);
        });
        
        setGeneratedPeriods(allPeriods);
        console.log('✅ Generated', allPeriods.length, 'pawn periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney');
        
    } catch (error) {
        console.error('Error generating pawn periods:', error);
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
  }, [pawn?.id, onDataChange]);

  // Use generated periods for display
  const periodsToDisplay = generatedPeriods;

  // Updated checkbox handler - simplified for pawns (only one period at a time)
  const handleCheckboxChange = async (period: PawnPaymentPeriod, checked: boolean, index: number) => {
    if (!pawn?.id || isProcessingCheckbox) return;
    const { id: userId } = await getCurrentUser();
    // Set global loading state
    setIsProcessingCheckbox(true);
    
    // Set loading state for this period
    const periodId = period.id || `temp-${period.period_number}`;
    setLoadingPeriods(prev => ({ ...prev, [periodId]: true }));
    
    try {
      if (checked) {
        // For pawns, only check the current period (no previous periods logic)
        console.log('Inserting daily payment records for period:', period.period_number);
        
        // Calculate all days in this period
        const startDate = new Date(period.start_date);
        const endDate = new Date(period.end_date);
        const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        console.log(`Period ${period.period_number}: ${totalDays} days from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
        
        // Use expected amount for checkbox payment (equal distribution)
        const totalAmount = period.expected_amount || 0;
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
            pawn_id: pawn.id,
            transaction_type: 'payment' as const,
            effective_date: currentDate.toISOString(),
            date_status: dateStatus,
            credit_amount: dayAmount,
            debit_amount: 0,
            description: `Thanh toán ngày ${dayOffset + 1}/${totalDays} của kỳ ${period.period_number}`,
            is_deleted: false,
            created_by: userId
          };
          
          dailyRecords.push(dailyRecord);
        }
        
        // Insert daily records into pawn_history
        const { data, error } = await supabase
          .from('pawn_history')
          .insert(dailyRecords)
          .select();
        
        if (error) {
          throw new Error(error.message);
        }
        
        console.log('Inserted', dailyRecords.length, 'daily payment records for period', period.period_number);
        
        // Update loan_period by adding the number of days in this period
        const periodDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const currentLoanPeriod = pawn.loan_period || 0;
        const newLoanPeriod = currentLoanPeriod + periodDays;
        
        console.log(`Updating loan_period: ${currentLoanPeriod} + ${periodDays} = ${newLoanPeriod}`);
        
        const { error: updateError } = await supabase
          .from('pawns')
          .update({ loan_period: newLoanPeriod })
          .eq('id', pawn.id);
        
        if (updateError) {
          console.error('Error updating loan_period:', updateError);
          // Don't throw error, just log it since payment was already recorded
        }
        
        toast({
          title: 'Thành công',
          description: `Đã thanh toán kỳ ${period.period_number}`,
        });
        
      } else {
        // Uncheck: Mark daily records for this period as deleted (soft delete)
        console.log('Marking daily payment records as deleted for period:', period.period_number);
        
        const startDate = period.start_date.split('T')[0];
        const endDate = period.end_date.split('T')[0];
        
        console.log('Deleting records between:', startDate, 'and', endDate);
        
        // Update records to is_deleted = true
        const { data, error } = await supabase
          .from('pawn_history')
          .update({is_deleted: true, updated_by: userId})
          .eq('pawn_id', pawn.id)
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
        
        // Update loan_period by subtracting the number of days in this period
        const startDateObj = new Date(period.start_date);
        const endDateObj = new Date(period.end_date);
        const periodDays = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const currentLoanPeriod = pawn.loan_period || 0;
        const newLoanPeriod = Math.max(0, currentLoanPeriod - periodDays); // Ensure it doesn't go below 0
        
        console.log(`Updating loan_period: ${currentLoanPeriod} - ${periodDays} = ${newLoanPeriod}`);
        
        const { error: updateError } = await supabase
          .from('pawns')
          .update({ loan_period: newLoanPeriod })
          .eq('id', pawn.id);
        
        if (updateError) {
          console.error('Error updating loan_period:', updateError);
          // Don't throw error, just log it since payment deletion was already recorded
        }
        
        toast({
          title: 'Thành công',
          description: `Đã bỏ thanh toán kỳ ${period.period_number}`,
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

  // Calculate interest for custom period - RETURN PROMISE
  const calculateInterestForCustomPeriod = async (startDate: string, endDate: string): Promise<number> => {
    if (!pawn?.id) return 0;
    
    try {
      const result = await calculateCustomPeriodInterest(pawn.id, startDate, endDate);
      console.log(`Calculated interest for ${startDate} → ${endDate}:`, result);
      return result;
    } catch (err) {
      console.error('Error calculating interest:', err);
      return 0;
    }
  };

  // Handle custom payment submit
  const handleCustomPaymentSubmit = async (data: {
    startDate: string;
    endDate: string;
    days: number;
    interestAmount: number;
    totalAmount: number;
    otherAmount?: number;
  }) => {
    if (!pawn?.id) return;

    try {
      // Import the new function
      const { saveCustomPaymentWithAmount } = await import('@/lib/Pawns/save_custom_payment');
      
      await saveCustomPaymentWithAmount(pawn.id, data);

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

  // State to store last payment end date
  const [lastPaymentEndDate, setLastPaymentEndDate] = useState<string | null>(null);

  // Load last payment end date when component mounts
  useEffect(() => {
    async function loadLastPaymentEndDate() {
      if (!pawn?.id) return;
      
      try {
        const endDate = await getLatestPaymentPaidDate(pawn.id);
        setLastPaymentEndDate(endDate);
      } catch (err) {
        console.error('Error loading last payment end date:', err);
      }
    }
    
    loadLastPaymentEndDate();
  }, [pawn?.id, onDataChange]); // Reload when data changes

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
      
      {/* Link to open payment form */}
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

      {/* Custom payment form */}
      {showPaymentForm && pawn && (
        <div className="mb-4">
          <PawnPaymentForm 
            isOpen={true}
            onClose={() => setShowPaymentForm(false)}
            pawn={pawn}
            selectedPeriods={[]}
            disabled={pawn?.status === PawnStatus.CLOSED || pawn?.status === PawnStatus.DELETED || isProcessingCheckbox}
            onSuccess={handleCustomPaymentSubmit}
            interestCalculator={calculateInterestForCustomPeriod}
            loanDate={pawn?.loan_date}
            loanPeriod={pawn?.loan_period}
            interestPeriod={pawn?.interest_period}
            lastPaymentEndDate={lastPaymentEndDate || undefined}
          />
        </div>
      )}

      {/* Payment periods table */}
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
                Đang tạo dữ liệu từ lịch sử thanh toán...
                </td>
              </tr>
            ) : (
            // Display generated periods with editable functionality
            periodsToDisplay.map((period, index) => {
                const expected = period.expected_amount || 0;
              const actual = period.actual_amount || period.expected_amount;
                const other = period.other_amount || 0;
              const total = expected + other;
              
              // Updated logic to determine if period has payments in DB
              const hasPayments = Boolean(period.id && period.id.startsWith('db-') && actual > 0);
                const periodId = period.id || `temp-${period.period_number}`;
                const isLoading = loadingPeriods[periodId];
                const isDisabled = pawn?.status === PawnStatus.CLOSED || pawn?.status === PawnStatus.DELETED;

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
                        <span 
                        className={`${!hasPayments && !isDisabled && !isProcessingCheckbox ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                        onClick={!hasPayments && !isDisabled && !isProcessingCheckbox ? () => handleCheckboxChange(period, true, index) : undefined}
                        >
                        {formatCurrency(actual)}
                        </span>
                    </td>
                    <td className="px-2 py-2 text-center border">
                      {isLoading ? (
                        <div className="flex justify-center">
                          <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin"></div>
                        </div>
                      ) : (
                        <Checkbox 
                          checked={hasPayments} 
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