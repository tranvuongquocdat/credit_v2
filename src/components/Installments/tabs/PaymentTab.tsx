import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatDate } from "@/lib/utils";
import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { format } from "date-fns";
import React, { useState, useEffect } from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { usePermissions } from "@/hooks/usePermissions";

interface PaymentTabProps {
  loading: boolean;
  error: string | null;
  calculateCombinedPaymentPeriods: InstallmentPaymentPeriod[];
  isPeriodInDatabase: (period: InstallmentPaymentPeriod) => boolean;
  selectedPeriodId: string | null;
  selectedDatePeriodId: string | null;
  selectedDate: string;
  tempEditedDate: string | null;
  tempEditedAmount: number | null;
  paymentAmount: number;
  installment: InstallmentWithCustomer;
  findOldestUnpaidPeriodIndex: number;
  handleStartEditing: (period: InstallmentPaymentPeriod, periodIndex: number) => void;
  handleSavePayment: (period: InstallmentPaymentPeriod) => void;
  setPaymentAmount: (amount: number) => void;
  setSelectedPeriodId: (id: string | null) => void;
  handleStartDateEditing: (period: InstallmentPaymentPeriod, periodIndex: number) => void;
  handleSaveDate: (period: InstallmentPaymentPeriod, date: string) => void;
  setSelectedDate: (date: string) => void;
  processingCheckbox: boolean;
  processingPeriodId: string | null;
  handleCheckboxChange: (period: InstallmentPaymentPeriod, checked: boolean, index: number) => void;
  onOptimisticStateChange?: (hasOptimisticUpdates: boolean) => void;
}

export const PaymentTab: React.FC<PaymentTabProps> = ({
  loading,
  error,
  calculateCombinedPaymentPeriods,
  isPeriodInDatabase,
  selectedPeriodId,
  selectedDatePeriodId,
  selectedDate,
  tempEditedDate,
  tempEditedAmount,
  paymentAmount,
  installment,
  findOldestUnpaidPeriodIndex,
  handleStartEditing,
  handleSavePayment,
  setPaymentAmount,
  setSelectedPeriodId,
  handleStartDateEditing,
  handleSaveDate,
  setSelectedDate,
  processingCheckbox,
  processingPeriodId,
  handleCheckboxChange,
  onOptimisticStateChange,
}) => {
  const { hasPermission } = usePermissions();
  
  // OPTIMISTIC UPDATES STATE
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, boolean>>({});
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  
  // Notify parent about optimistic state changes
  useEffect(() => {
    const hasOptimisticUpdates = Object.keys(optimisticUpdates).length > 0;
    onOptimisticStateChange?.(hasOptimisticUpdates);
  }, [optimisticUpdates, onOptimisticStateChange]);
  
  // Kiểm tra quyền đóng lãi trả góp
  const canPayInstallment = hasPermission('dong_lai_tra_gop');
  
  // Helper to format number with dot
  const formatNumberWithDot = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  // OPTIMISTIC HELPER: Get effective checked state
  const getEffectiveCheckedState = (period: InstallmentPaymentPeriod): boolean => {
    const periodId = period.id;
    
    // Prioritize optimistic state if exists
    if (periodId in optimisticUpdates) {
      return optimisticUpdates[periodId];
    }
    
    // Fall back to actual database state
    return isPeriodInDatabase(period);
  };

  // OPTIMISTIC HANDLER: Enhanced checkbox handler
  const handleOptimisticCheckboxChange = async (
    period: InstallmentPaymentPeriod,
    checked: boolean,
    index: number
  ) => {
    const periodId = period.id;
    
    // 1. IMMEDIATE UI UPDATE (Optimistic)
    setOptimisticUpdates(prev => ({
      ...prev,
      [periodId]: checked
    }));
    
    // 2. Show background sync indicator
    setIsBackgroundSyncing(true);
    
    try {
      // 3. Background database sync
      await handleCheckboxChange(period, checked, index);
      
      // 4. Clear optimistic state after successful sync
      setOptimisticUpdates(prev => {
        const newUpdates = { ...prev };
        delete newUpdates[periodId];
        return newUpdates;
      });
      
    } catch (error) {
      // 5. Rollback optimistic update on error
      setOptimisticUpdates(prev => {
        const newUpdates = { ...prev };
        delete newUpdates[periodId];
        return newUpdates;
      });
      
      console.error('Optimistic update failed, rolled back:', error);
    } finally {
      // 6. Hide sync indicator after delay
      setTimeout(() => {
        setIsBackgroundSyncing(false);
      }, 800);
    }
  };

  return (
    <div className="relative">
      {/* Background sync indicator */}
      {isBackgroundSyncing && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full shadow-lg z-20 flex items-center">
          <div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin mr-2"></div>
          Đang đồng bộ...
        </div>
      )}
      
      {/* CONDITIONAL LOADING: Only show when no data exists */}
      {loading && calculateCombinedPaymentPeriods.length === 0 ? (
        <div className="text-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-2 text-gray-500">Đang tải dữ liệu...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">STT</th>
                <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">Ngày (Từ → Đến)</th>
                <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border">Ngày giao dịch</th>
                <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền lãi phí</th>
                <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khách trả</th>
                <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {calculateCombinedPaymentPeriods.map((period, index) => {
                const actualAmount = period.actualAmount || period.expectedAmount;
                
                // USE OPTIMISTIC STATE
                const isPaid = getEffectiveCheckedState(period);
                
                const isEditing = selectedPeriodId === period.id;
                const isDateEditing = selectedDatePeriodId === period.id;

                return (
                  <tr key={period.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 text-center border">{period.periodNumber}</td>
                    <td className="px-2 py-2 text-center border">{formatDate(period.dueDate)} → {formatDate(period.endDate || null)}</td>
                    <td className="px-2 py-2 text-center border">
                      {isDateEditing && selectedDatePeriodId === period.id ? (
                        <DatePicker
                          value={selectedDate}
                          onChange={(date) => {
                            setSelectedDate(date);
                            handleSaveDate(period, date);
                          }}
                          className="w-32 text-center mx-auto"
                          maxDate={format(new Date(), "yyyy-MM-dd")}
                          disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                        />
                      ) : (
                        <span
                          className={`${index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED && installment.status !== InstallmentStatus.DELETED && canPayInstallment ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                          onClick={
                            index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED && installment.status !== InstallmentStatus.DELETED && canPayInstallment
                              ? () => handleStartDateEditing(period, index)
                              : undefined
                          }
                        >
                          {index === findOldestUnpaidPeriodIndex && tempEditedDate 
                            ? format(new Date(tempEditedDate), "dd/MM/yyyy")
                            : format(period.paymentStartDate ? new Date(period.paymentStartDate) : new Date(), "dd/MM/yyyy")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right border">{formatCurrency(period.expectedAmount)}</td>
                    <td className="px-2 py-2 text-right border">
                      {isEditing ? (
                        <div className="flex items-center justify-end space-x-1">
                          <input
                            type="text"
                            className="border rounded w-24 px-1 py-0.5 text-right text-sm"
                            value={formatNumberWithDot(paymentAmount)}
                            onChange={(e) =>
                              setPaymentAmount(
                                parseFloat(e.target.value.replace(/\./g, "")) || 1
                              )
                            }
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSavePayment(period);
                              } else if (e.key === "Escape") {
                                setSelectedPeriodId(null);
                              }
                            }}
                            disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED || !canPayInstallment}
                          />
                          <button
                            className="text-xs bg-blue-500 text-white px-1 rounded"
                            onClick={() => handleSavePayment(period)}
                            disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED || !canPayInstallment}
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`${index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED && installment.status !== InstallmentStatus.DELETED && canPayInstallment ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                          onClick={
                            index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED && installment.status !== InstallmentStatus.DELETED && canPayInstallment
                              ? () => handleStartEditing(period, index)
                              : undefined
                          }
                        >
                          {index === findOldestUnpaidPeriodIndex && tempEditedAmount !== null
                            ? formatCurrency(tempEditedAmount)
                            : formatCurrency(actualAmount)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center border">
                      <Checkbox
                        checked={isPaid}
                        disabled={processingCheckbox || installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                        onCheckedChange={(checked) => {
                          console.log("optimistic checkbox change:", period.id, checked);
                          if (period && period.id) {
                            // USE OPTIMISTIC HANDLER
                            handleOptimisticCheckboxChange(period, !!checked, index);
                          }
                        }}
                      />
                      {/* Per-period loading indicator */}
                      {processingCheckbox && processingPeriodId === period.id && (
                        <div className="inline-block ml-2 animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700"></div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}; 