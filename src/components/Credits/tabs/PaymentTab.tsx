'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PaymentForm } from '../PaymentForm';
import { CreditWithCustomer } from '@/models/credit';
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
  
  // State for recalculated periods based on new logic
  const [recalculatedPeriods, setRecalculatedPeriods] = useState<CreditPaymentPeriod[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);
  
  // Load principal changes if not provided
  useEffect(() => {
    if (principalChanges && principalChanges.length > 0) {
      setLocalPrincipalChanges(principalChanges);
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
        
        setLocalPrincipalChanges(data || []);
      } catch (err) {
        console.error('Error fetching principal changes:', err);
      }
    }

    loadPrincipalChanges();
  }, [credit?.id, principalChanges]);

  // New function to recalculate periods based on new logic
  const recalculatePeriodsWithHistory = async () => {
    if (!credit?.id) return;

    setIsRecalculating(true);
    try {
      // 1. Lấy các kỳ đóng lãi đã có trong DB
      const { getCreditPaymentPeriods } = await import('@/lib/credit-payment');
      const { data: existingPeriods } = await getCreditPaymentPeriods(credit.id);
      
      // 2. Tính ngày tiếp theo phải đóng và số tiền 1 ngày
      let nextPaymentDate: Date;
      let dailyAmount = 0;
      
      // Tính daily rate
      if (credit.interest_ui_type?.startsWith('daily')) {
        if (credit.interest_notation === 'k_per_million') {
          dailyAmount = (credit.loan_amount / 1000000) * credit.interest_value * 1000;
        } else if (credit.interest_notation === 'k_per_day') {
          dailyAmount = credit.interest_value * 1000;
        }
      } else if (credit.interest_ui_type?.startsWith('monthly')) {
        const monthlyAmount = credit.loan_amount * (credit.interest_value / 100);
        const daysInPeriod = credit.interest_period || 30;
        dailyAmount = monthlyAmount / daysInPeriod;
      } else if (credit.interest_ui_type?.startsWith('weekly')) {
        const weeklyAmount = credit.interest_ui_type === 'weekly_percent' 
          ? credit.loan_amount * (credit.interest_value / 100)
          : credit.interest_value * 1000;
        dailyAmount = weeklyAmount / 7;
      }

      // Xác định ngày tiếp theo phải đóng
      if (existingPeriods && existingPeriods.length > 0) {
        // Lấy kỳ cuối cùng và tính ngày tiếp theo
        const lastPeriod = existingPeriods.sort((a, b) => b.period_number - a.period_number)[0];
        nextPaymentDate = new Date(lastPeriod.end_date);
        nextPaymentDate.setDate(nextPaymentDate.getDate() + 1);
      } else {
        // Chưa có kỳ nào, bắt đầu từ ngày vay
        nextPaymentDate = new Date(credit.loan_date);
      }

      // 3. Truy vấn history contract_reopen và contract_close
      const { supabase } = await import('@/lib/supabase');
      const { data: historyData } = await supabase
        .from('credit_amount_history')
        .select('transaction_type, debit_amount, credit_amount')
        .eq('credit_id', credit.id)
        .in('transaction_type', ['contract_reopen', 'contract_close'])
        .order('created_at', { ascending: true });

      // 4. Tính chênh lệch debit và credit amount
      let historyBalance = 0;
      if (historyData && historyData.length > 0) {
        historyBalance = historyData.reduce((sum, record) => {
          const debit = record.debit_amount || 0;
          const credit = record.credit_amount || 0;
          return sum + (credit - debit);
        }, 0);
      }

      // Trừ đi tiền gốc của hợp đồng
      const excessAmount = historyBalance - credit.loan_amount;
      console.log('History balance:', historyBalance, 'Loan amount:', credit.loan_amount, 'Excess:', excessAmount);

      const newPeriods: CreditPaymentPeriod[] = [...(existingPeriods || [])];
      let currentPeriodNumber = existingPeriods ? Math.max(...existingPeriods.map(p => p.period_number), 0) + 1 : 1;
      let currentStartDate = new Date(nextPaymentDate);

      // 5. Nếu excess > 0, tạo kỳ "tạm thời"
      if (excessAmount > 0 && dailyAmount > 0) {
        const tempPeriodDays = Math.ceil(excessAmount / dailyAmount);
        const tempEndDate = new Date(currentStartDate);
        tempEndDate.setDate(currentStartDate.getDate() + tempPeriodDays - 1);

        const tempPeriod: CreditPaymentPeriod = {
          id: `temp-history-${currentPeriodNumber}`,
          credit_id: credit.id,
          period_number: currentPeriodNumber,
          start_date: currentStartDate.toISOString(),
          end_date: tempEndDate.toISOString(),
          expected_amount: excessAmount,
          actual_amount: 0,
          payment_date: null,
          notes: 'Kỳ tạm thời từ lịch sử mở/đóng hợp đồng',
          other_amount: 0
        };

        newPeriods.push(tempPeriod);
        currentPeriodNumber++;
        
        // Cập nhật ngày bắt đầu cho kỳ tiếp theo
        currentStartDate = new Date(tempEndDate);
        currentStartDate.setDate(tempEndDate.getDate() + 1);
      }

      // 6. Tiếp tục tính các kỳ ước tính còn lại
      const loanEndDate = new Date(credit.loan_date);
      loanEndDate.setDate(loanEndDate.getDate() + credit.loan_period - 1);
      const interestPeriod = credit.interest_period || 30;

      while (currentStartDate <= loanEndDate && newPeriods.length < 100) { // Giới hạn để tránh vòng lặp vô hạn
        const periodEndDate = new Date(currentStartDate);
        periodEndDate.setDate(currentStartDate.getDate() + interestPeriod - 1);
        
        // Đảm bảo không vượt quá ngày kết thúc hợp đồng
        if (periodEndDate > loanEndDate) {
          periodEndDate.setTime(loanEndDate.getTime());
        }

        // Tính số ngày trong kỳ này
        const daysInPeriod = Math.floor((periodEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const expectedAmount = calculateInterestWithPrincipalChanges(
          credit,
          currentStartDate,
          periodEndDate,
          localPrincipalChanges
        ) || Math.round(dailyAmount * daysInPeriod);

        const estimatedPeriod: CreditPaymentPeriod = {
          id: `calculated-${currentPeriodNumber}`,
          credit_id: credit.id,
          period_number: currentPeriodNumber,
          start_date: currentStartDate.toISOString(),
          end_date: periodEndDate.toISOString(),
          expected_amount: expectedAmount,
          actual_amount: 0,
          payment_date: null,
          notes: null,
          other_amount: 0
        };

        newPeriods.push(estimatedPeriod);
        currentPeriodNumber++;

        // Chuẩn bị cho kỳ tiếp theo
        currentStartDate = new Date(periodEndDate);
        currentStartDate.setDate(periodEndDate.getDate() + 1);

        // Kiểm tra nếu ngày bắt đầu vượt quá ngày kết thúc hợp đồng
        if (currentStartDate > loanEndDate) break;
      }

      // Sắp xếp lại theo period_number
      newPeriods.sort((a, b) => a.period_number - b.period_number);
      setRecalculatedPeriods(newPeriods);

    } catch (error) {
      console.error('Error recalculating periods with history:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi tính toán lại các kỳ thanh toán"
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  // Effect to recalculate periods when credit or payment periods change
  useEffect(() => {
    if (credit?.id) {
      recalculatePeriodsWithHistory();
    }
  }, [credit?.id, paymentPeriods]);

  // Use recalculated periods if available, otherwise use original combined periods
  const periodsToDisplay = recalculatedPeriods.length > 0 ? recalculatedPeriods : combinedPaymentPeriods;

  // Calculate interest with principal changes
  const calculateInterestForPeriod = (startDate: string, endDate: string): number => {
    if (!credit) return 0;
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
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
  };
  
  // Start editing a payment
  const startEditing = (period: CreditPaymentPeriod) => {
    if (period.actual_amount >= period.expected_amount) return; // Don't edit paid periods
    
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
    if (!credit?.id) return;
    
    // Set loading state for this period
    const periodId = period.id || `temp-${period.period_number}`;
    setLoadingPeriods(prev => ({ ...prev, [periodId]: true }));
    
    try {
      // Import necessary functions
      const { savePaymentWithOtherAmount, markPeriodAsPaid, deletePaymentPeriod } = await import('@/lib/credit-payment');
      
      if (checked) {
        // Find all unchecked periods from the oldest up to this one
        const periodsToCheck = [];
        
        // Go through all periods up to the current one (inclusive)
        for (let i = 0; i <= index; i++) {
          const p = periodsToDisplay[i];
          // Only include periods that aren't already paid
          if (p.actual_amount < p.expected_amount) {
            periodsToCheck.push(p);
          }
        }
        
        // If no periods to check, exit early
        if (periodsToCheck.length === 0) {
          setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
          return;
        }
        
        // Perform all actions for all selected periods
        for (const p of periodsToCheck) {
          // Kiểm tra xem đây là kỳ tạm thời hay không
          const isCalculatedPeriod = !p.id || p.id.startsWith('calculated-') || p.id.startsWith('temp-');
          
          if (isCalculatedPeriod) {
            // Đối với kỳ tạm thời, sử dụng savePaymentWithOtherAmount để tạo mới
            await savePaymentWithOtherAmount(
              credit.id,
              p,
              p.expected_amount || 0,
              p.other_amount || 0,
              true // isCalculatedPeriod = true
            );
          } else {
            // Đối với kỳ đã tồn tại, sử dụng markPeriodAsPaid để cập nhật
            await markPeriodAsPaid(
              p.id, 
              p.expected_amount, 
              new Date().toISOString(),
              "Đóng lãi qua checkbox"
            );
          }
        }
        
        // Notify success
        toast({
          title: 'Thành công',
          description: 'Đã đánh dấu các kỳ là đã thanh toán',
        });
        
        // Trigger data change
        if (onDataChange) onDataChange();
      } else {
        // If unchecking, find all checked periods from this one to the newest
        const periodsToUncheck = [];
        
        // Go through all periods from the current one to the end
        for (let i = periodsToDisplay.length - 1; i >= index; i--) {
          const p = periodsToDisplay[i];
          // Only include periods that are fully paid
          if (p.actual_amount >= p.expected_amount) {
            periodsToUncheck.push(p);
          }
        }
        
        // If no periods to uncheck, exit early
        if (periodsToUncheck.length === 0) {
          setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
          return;
        }
        
        // Perform all actions for all selected periods
        for (const p of periodsToUncheck) {
          // Chỉ xóa kỳ nếu đã có trong database (có ID hợp lệ)
          if (p.id && !p.id.startsWith('calculated-') && !p.id.startsWith('temp-')) {
            await deletePaymentPeriod(p.id);
          }
        }
        
        // Notify success
        toast({
          title: 'Thành công',
          description: 'Đã đánh dấu các kỳ là chưa thanh toán',
        });
        
        // Trigger data change
        if (onDataChange) onDataChange();
      }
    } catch (error) {
      console.error('Error changing payment status:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể thay đổi trạng thái thanh toán',
        variant: 'destructive'
      });
    } finally {
      setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
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
              const total = expected + other; // Tổng lãi phí = expected + other
              const isPaid = period.actual_amount >= period.expected_amount;
              const isPartiallyPaid = period.actual_amount > 0 && period.actual_amount < period.expected_amount;
              const isEditing = editingPeriodId === period.id || editingPeriodId === `temp-${period.period_number}`;
              const periodId = period.id || `temp-${period.period_number}`;
              const isLoading = loadingPeriods[periodId];
              
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
                        className={`${!isPaid ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                        onClick={!isPaid ? () => startEditing(period) : undefined}
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
                        checked={isPaid || isPartiallyPaid} 
                        onCheckedChange={(checked) => handleCheckboxChange(period, !!checked, index)}
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
