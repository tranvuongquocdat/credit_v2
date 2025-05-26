'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PawnPaymentForm } from '../PawnPaymentForm';
import { PawnWithCustomerAndCollateral } from '@/models/pawn';
import { PawnPaymentPeriod } from '@/models/pawn-payment';
import { toast } from '@/components/ui/use-toast';
import { PrincipalChange, calculateInterestWithPrincipalChanges } from '@/lib/interest-calculator';
import { getPrincipalChangesForPawn } from '@/lib/pawn-principal-changes';

type PaymentTabProps = {
  pawn: PawnWithCustomerAndCollateral | null;
  paymentPeriods: PawnPaymentPeriod[];
  combinedPaymentPeriods: PawnPaymentPeriod[];
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
  pawn,
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

  // Load principal changes if not provided
  useEffect(() => {
    if (principalChanges && principalChanges.length > 0) {
      setLocalPrincipalChanges(principalChanges);
      return;
    }

    async function loadPrincipalChanges() {
      if (!pawn?.id) return;

      try {
        const { data, error } = await getPrincipalChangesForPawn(pawn.id);
        
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
  }, [pawn?.id, principalChanges]);

  // Calculate interest with principal changes
  const calculateInterestForPeriod = (startDate: string, endDate: string): number => {
    if (!pawn) return 0;
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Convert pawn to credit-like object for interest calculation
      const creditLikeObject = {
        ...pawn,
        status: pawn.status || 'active', // Map pawn status to credit status
        interest_type: pawn.interest_type || 'percentage',
        interest_value: pawn.interest_value || 0,
        interest_period: pawn.interest_period || 30,
        interest_ui_type: pawn.interest_ui_type || 'monthly_30'
      };
      
      return calculateInterestWithPrincipalChanges(
        creditLikeObject as any, // Type assertion needed due to status type mismatch
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
  const startEditing = (period: PawnPaymentPeriod) => {
    // Don't edit periods that are already paid (checked)
    if (period.actual_amount >= period.expected_amount) return;
    
    setEditingPeriodId(period.id || `temp-${period.period_number}`);
    setPaymentAmount(period.actual_amount || period.expected_amount || 0);
  };
  
  // Stop editing and cancel
  const cancelEditing = () => {
    setEditingPeriodId(null);
  };
  
  // Handle saving payment
  const savePayment = async (period: PawnPaymentPeriod) => {
    console.log('Saving payment for period:', period);
    if (!pawn?.id) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log(today);
      const isCalculatedPeriod = !period.id || period.id.startsWith('calculated-') || period.id.startsWith('estimated-');
      console.log(paymentAmount);
      
      // Import dynamically to prevent import cycle
      const { savePawnPayment, updatePawnPaymentPeriod } = await import('@/lib/pawn-payment');
      
      if (isCalculatedPeriod) {
        // For calculated periods, create new payment period
        await savePawnPayment(
          pawn.id,
          period,
          paymentAmount,
          true
        );
      } else if (period.id) {
        // For existing periods, update the payment
        await updatePawnPaymentPeriod(period.id as string, {
          actual_amount: paymentAmount,
          payment_date: new Date().toISOString(),
          notes: "Thanh toán lãi phí"
        });
      }
      
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
  const handleCheckboxChange = async (period: PawnPaymentPeriod, checked: boolean, index: number) => {
    if (!pawn?.id) return;
    
    // Set loading state for this period
    const periodId = period.id || `temp-${period.period_number}`;
    setLoadingPeriods(prev => ({ ...prev, [periodId]: true }));
    
    try {
      // Import necessary functions
      const { savePawnPayment, updatePawnPaymentPeriod, deletePawnPaymentPeriod } = await import('@/lib/pawn-payment');
      
      if (checked) {
        // Find all unchecked periods from the oldest up to this one
        const periodsToCheck = [];
        
        // Go through all periods up to the current one (inclusive)
        for (let i = 0; i <= index; i++) {
          const p = combinedPaymentPeriods[i];
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
          // Check if this is a calculated/estimated period
          const isCalculatedPeriod = !p.id || p.id.startsWith('calculated-') || p.id.startsWith('estimated-') || p.id.startsWith('temp-');
          
          if (isCalculatedPeriod) {
            // For calculated periods, use savePawnPayment to create new
            await savePawnPayment(
              pawn.id,
              p,
              p.expected_amount || 0,
              true // isCalculatedPeriod = true
            );
          } else {
            // For existing periods, use updatePawnPaymentPeriod to update
            await updatePawnPaymentPeriod(p.id, {
              actual_amount: p.expected_amount,
              payment_date: new Date().toISOString(),
              notes: "Đóng lãi qua checkbox"
            });
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
        // Only allow unchecking the latest paid period
        const p = combinedPaymentPeriods[index];
        
        // Check if this period has a real UUID (exists in database)
        const isRealPayment = p.id && 
          !p.id.startsWith('calculated-') && 
          !p.id.startsWith('estimated-') && 
          !p.id.startsWith('temp-') &&
          p.actual_amount >= p.expected_amount;
        
        if (!isRealPayment) {
          setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
          return;
        }
        
        // Find the latest paid period (highest index with actual payment)
        let latestPaidIndex = -1;
        for (let i = combinedPaymentPeriods.length - 1; i >= 0; i--) {
          const period = combinedPaymentPeriods[i];
          if (period.id && 
              !period.id.startsWith('calculated-') && 
              !period.id.startsWith('estimated-') && 
              !period.id.startsWith('temp-') &&
              period.actual_amount >= period.expected_amount) {
            latestPaidIndex = i;
            break;
          }
        }
        
        // Check if current period is the latest paid period
        if (index !== latestPaidIndex) {
          setLoadingPeriods(prev => ({ ...prev, [periodId]: false }));
          toast({
            title: 'Không thể thực hiện',
            description: 'Chỉ có thể xóa kỳ thanh toán mới nhất. Vui lòng xóa theo thứ tự từ kỳ mới nhất.',
            variant: 'destructive'
          });
          return;
        }
        
        // Delete the payment period from database
        await deletePawnPaymentPeriod(p.id);
        
        // Notify success
        toast({
          title: 'Thành công',
          description: 'Đã xóa kỳ thanh toán',
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
      {showPaymentForm && pawn && (
        <div className="border p-4 rounded mb-4">
          <PawnPaymentForm 
            isOpen={true}
            onClose={() => setShowPaymentForm(false)}
            pawn={pawn}
            selectedPeriods={[]}
            onSuccess={async (data) => {
              try {
                console.log('Payment data submitted:', data);
                
                // Calculate interest considering principal changes
                const interestAmount = calculateInterestForPeriod(
                  data.startDate,
                  data.endDate
                );
                
                // Import the function dynamically to prevent import cycle
                const { saveCustomPaymentWithOtherAmount } = await import('@/lib/pawn-payment');
                
                await saveCustomPaymentWithOtherAmount(
                  pawn.id,
                  {
                    period_number: combinedPaymentPeriods.filter(p => p.actual_amount >= p.expected_amount).length + 1, // Custom payment
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
            // Truyền thêm các thông tin về kỳ hạn
            loanDate={pawn.loan_date}
            loanPeriod={pawn.loan_period}
            interestPeriod={pawn.interest_period}
            // Truyền thông tin về kỳ thanh toán cuối cùng ĐÃ THANH TOÁN
            lastPaymentEndDate={(() => {
              // Tìm kỳ cuối cùng đã thanh toán
              const paidPeriods = combinedPaymentPeriods.filter(
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
            ) : combinedPaymentPeriods.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-center text-gray-500">
                  Chưa có dữ liệu thanh toán
                </td>
              </tr>
            ) : (
              // Display combined calculated and actual data from database
              combinedPaymentPeriods.map((period, index) => {
                const expected = period.expected_amount || 0;
                // For actual amount display:
                // - If it's an estimated/calculated period (not in DB yet), show 0 or expected_amount as placeholder
                // - If it's a real period from DB, show the actual_amount from database (never override this!)
                const actual = (period.id && !period.id.startsWith('calculated-') && !period.id.startsWith('estimated-') && !period.id.startsWith('temp-')) 
                  ? (period.actual_amount || 0) // Real period from DB - use actual_amount as is
                  : period.expected_amount + (period.other_amount || 0); // Estimated period - show the sum of expected_amount and other_amount calculated from interest calculator
                const other = period.other_amount || 0;
                const total = expected + other; // Total interest = expected + other
                const isPaid = period.id && !period.id.startsWith('calculated-') && !period.id.startsWith('estimated-') && !period.id.startsWith('temp-') && (period.actual_amount >= period.expected_amount);
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