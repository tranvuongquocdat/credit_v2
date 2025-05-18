'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PaymentForm } from '../PaymentForm';
import { CreditWithCustomer } from '@/models/credit';
import { CreditPaymentPeriod, PaymentPeriodStatus } from '@/models/credit-payment';
import { savePaymentWithOtherAmount, markPeriodAsPaid, deletePaymentPeriod } from '@/lib/credit-payment';

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
  onDataChange
}: PaymentTabProps) {
  // State for inline payment editing
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  
  // Start editing a payment
  const startEditing = (period: CreditPaymentPeriod) => {
    if (period.status === PaymentPeriodStatus.PAID) return; // Don't edit paid periods
    
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
      alert('Có lỗi xảy ra khi lưu thanh toán. Vui lòng thử lại.');
    }
  };
  
  // Handler for checkbox change
  const handleCheckboxChange = async (period: CreditPaymentPeriod, checked: boolean, index: number) => {
    if (!credit?.id) return;
    
    try {
      if (checked) {
        // Find all unchecked periods from the oldest up to this one
        const periodsToCheck = [];
        
        // Go through all periods up to the current one (inclusive)
        for (let i = 0; i <= index; i++) {
          const p = combinedPaymentPeriods[i];
          // Only include periods that aren't already paid
          if (p.status !== PaymentPeriodStatus.PAID && p.status !== PaymentPeriodStatus.PARTIALLY_PAID) {
            periodsToCheck.push(p);
          }
        }
        
        // If no periods to check, exit early
        if (periodsToCheck.length === 0) {
          return;
        }
        
        const today = new Date().toISOString().split('T')[0];
        
        // Process each period that needs to be checked
        for (const periodToCheck of periodsToCheck) {
          const isCalculatedPeriod = !periodToCheck.id || periodToCheck.id.startsWith('calculated-');
          
          if (isCalculatedPeriod) {
            // For calculated periods, use savePaymentWithOtherAmount to create a new record
            if (credit.id) {
              await savePaymentWithOtherAmount(
                credit.id,
                periodToCheck,
                periodToCheck.expected_amount || 0,
                periodToCheck.other_amount || 0,
                true // isCalculatedPeriod = true
              );
            }
          } else {
            // For existing periods, use markPeriodAsPaid to update the record
            await markPeriodAsPaid(
              periodToCheck.id!, 
              periodToCheck.expected_amount || 0, 
              today
            );
          }
        }
      } else {
        // Check if any later periods are checked
        const laterPeriods = combinedPaymentPeriods.slice(index + 1);
        const anyLaterPeriodPaid = laterPeriods.some(p => 
          p.status === PaymentPeriodStatus.PAID || p.status === PaymentPeriodStatus.PARTIALLY_PAID
        );
        
        if (anyLaterPeriodPaid) {
          alert('Không thể bỏ chọn kỳ thanh toán này vì đã có kỳ thanh toán sau đã được thanh toán.');
          return;
        }
        
        // Remove payment - but only if it's an existing period (has ID)
        if (period.id && !period.id.startsWith('calculated-')) {
          await deletePaymentPeriod(period.id);
        }
      }
      
      // Reload data to reflect changes
      if (onDataChange) {
        onDataChange();
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      alert('Có lỗi xảy ra khi cập nhật trạng thái thanh toán. Vui lòng thử lại.');
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
      {showPaymentForm && credit && (
        <div className="border p-4 rounded mb-4">
          <PaymentForm 
            onClose={() => setShowPaymentForm(false)}
            onSubmit={(data) => {
              console.log('Payment data submitted:', data);
              setShowPaymentForm(false);
              if (onDataChange) onDataChange();
            }} 
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
            // Hiển thị kết hợp của dữ liệu tính toán trước và dữ liệu thực từ database
            combinedPaymentPeriods.map((period, index) => {
              const expected = period.expected_amount || 0;
              const actual = period.actual_amount || (period.expected_amount || 0) + (period.other_amount || 0);
              const other = period.other_amount || 0;
              const total = expected + other; // Tổng lãi phí = expected + other
              const isPaid = period.status === PaymentPeriodStatus.PAID;
              const isPartiallyPaid = period.status === PaymentPeriodStatus.PARTIALLY_PAID;
              const isEditing = editingPeriodId === period.id || editingPeriodId === `temp-${period.period_number}`;
              
              return (
                <tr key={period.id || `temp-${period.period_number}`} className="hover:bg-gray-50">
                  <td className="px-2 py-2 text-center border">{period.period_number}</td>
                  <td className="px-2 py-2 text-center border">
                    {formatDate(period.start_date)} 
                    {' →'} 
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
                    <Checkbox 
                      checked={isPaid || isPartiallyPaid} 
                      onCheckedChange={(checked) => handleCheckboxChange(period, !!checked, index)}
                    />
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
