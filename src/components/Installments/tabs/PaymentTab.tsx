import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { InstallmentWithCustomer, InstallmentStatus } from "@/models/installment";
import { format } from "date-fns";
import React from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";

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
}) => {
  // Helper to format number with dot
  const formatNumberWithDot = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  return (
    <div>
      {loading ? (
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
                const isPaid = isPeriodInDatabase(period);
                const isEditing = selectedPeriodId === period.id;
                const isDateEditing = selectedDatePeriodId === period.id;

                // Calculate date range using endDate when available
                const dateRange = period.endDate
                  ? `${period.dueDate} → ${period.endDate}`
                  : (() => {
                      let periodDays = installment.payment_period || 30;
                      if (index === calculateCombinedPaymentPeriods.length - 1) {
                        const totalDays = installment.duration || 0;
                        const startDate = new Date(installment.start_date);
                        const currentDate = new Date(period.dueDate.split('/').reverse().join('-'));
                        const daysElapsed = Math.ceil((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                        const remainingDays = totalDays - daysElapsed;
                        if (remainingDays > 0 && remainingDays < periodDays) {
                          periodDays = remainingDays + 1;
                        }
                      }
                      const startDate = period.dueDate ? new Date(period.dueDate.split("/").reverse().join("-")) : new Date();
                      const endDate = new Date(startDate);
                      endDate.setDate(endDate.getDate() + (periodDays - 1));
                      return `${period.dueDate} → ${format(endDate, "dd/MM/yyyy")}`;
                    })();

                return (
                  <tr key={period.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 text-center border">{period.periodNumber}</td>
                    <td className="px-2 py-2 text-center border">{dateRange}</td>
                    <td className="px-2 py-2 text-center border">
                      {isDateEditing && selectedDatePeriodId === period.id ? (
                        <DatePicker
                          value={selectedDate}
                          onChange={(date) => {
                            setSelectedDate(date);
                            handleSaveDate(period, date);
                          }}
                          className="w-32 text-center mx-auto"
                          disabled={installment.status === InstallmentStatus.CLOSED}
                        />
                      ) : (
                        <span
                          className={`${index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                          onClick={
                            index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED
                              ? () => handleStartDateEditing(period, index)
                              : undefined
                          }
                        >
                          {index === findOldestUnpaidPeriodIndex && tempEditedDate 
                            ? format(new Date(tempEditedDate), "dd/MM/yyyy")
                            : period.paymentStartDate || format(new Date(), "dd/MM/yyyy")}
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
                                parseFloat(e.target.value.replace(/\./g, "")) || 0
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
                            disabled={installment.status === InstallmentStatus.CLOSED}
                          />
                          <button
                            className="text-xs bg-blue-500 text-white px-1 rounded"
                            onClick={() => handleSavePayment(period)}
                            disabled={installment.status === InstallmentStatus.CLOSED}
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`${index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                          onClick={
                            index === findOldestUnpaidPeriodIndex && !isPaid && installment.status !== InstallmentStatus.CLOSED
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
                        disabled={processingCheckbox || installment.status === InstallmentStatus.CLOSED}
                        onCheckedChange={(checked) => {
                          console.log("checked",period.id);
                          if (period && period.id) {
                            handleCheckboxChange(period, !!checked, index);
                          }
                        }}
                      />
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