import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { InstallmentWithCustomer, InstallmentStatus } from '@/models/installment';
import { InstallmentPaymentPeriod } from '@/models/installmentPayment';
import { useInstallmentPaymentPeriods } from '@/hooks/useInstallmentPaymentPeriods';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { getExpectedMoney } from '@/lib/Installments/get_expected_money';
import { getLatestPaymentPaidDate } from '@/lib/Installments/get_latest_payment_paid_date';
import { usePermissions } from '@/hooks/usePermissions';
import { getCurrentUser } from '@/lib/auth';
import { getInstallmentStatus, updateInstallmentPaymentDueDate } from '@/lib/installment';
import { DatePicker } from '@/components/ui/date-picker';
import { format } from 'date-fns';

interface PaymentTabProps {
  installment: InstallmentWithCustomer;
  onDataChange?: () => void;
  onOptimisticStateChange?: (hasUpdates: boolean) => void;
}

export function PaymentTabFast({
  installment,
  onDataChange,
  onOptimisticStateChange,
}: PaymentTabProps) {
  // Refresh key forces hook to rerun when data is changed externally
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    periods: generatedPeriods,
    loading,
    error,
    dailyAmounts: cachedDailyAmounts,
  } = useInstallmentPaymentPeriods(
    installment?.id,
    installment?.start_date,
    installment?.payment_period,
    refreshKey,
  );

  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const { hasPermission } = usePermissions();

  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, boolean>>({});
  const [loadingPeriods, setLoadingPeriods] = useState<Record<string, boolean>>({});
  const [isProcessingCheckbox, setIsProcessingCheckbox] = useState(false);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const [editingDatePeriodId, setEditingDatePeriodId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [periodTransactionDates, setPeriodTransactionDates] = useState<Record<string, string>>({});

  // Expose optimistic state up
  useEffect(() => {
    onOptimisticStateChange?.(Object.keys(optimisticUpdates).length > 0);
  }, [optimisticUpdates, onOptimisticStateChange]);

  const getEffectiveCheckedState = (period: InstallmentPaymentPeriod) => {
    if (period.id in optimisticUpdates) return optimisticUpdates[period.id];
    return period.id.startsWith('db-') && (period.actualAmount || 0) > 0;
  };

  const handleBackgroundSync = async () => {
    if (!onDataChange) return;
    setIsBackgroundSyncing(true);
    try {
      onDataChange();
      await new Promise((r) => setTimeout(r, 600));
      setRefreshKey((k) => k + 1);
      onOptimisticStateChange?.(true);
    } finally {
      setIsBackgroundSyncing(false);
    }
  };

  // Helper for number formatting inside input
  const formatNumberInput = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const parseFormattedNumber = (str: string) => parseInt(str.replace(/\./g, '')) || 0;

  const startEditing = (period: InstallmentPaymentPeriod) => {
    const hasPayments = getEffectiveCheckedState(period);
    if (hasPayments || isProcessingCheckbox) return;

    const earliestUnpaidIdx = generatedPeriods.findIndex((p) => !getEffectiveCheckedState(p));
    const currentIdx = generatedPeriods.findIndex((p) => p.id === period.id);
    if (currentIdx !== earliestUnpaidIdx) return;

    setEditingPeriodId(period.id);
    setPaymentAmount(period.actualAmount || period.expectedAmount || 0);
  };

  const cancelEditing = () => setEditingPeriodId(null);

  const startDateEditing = (period: InstallmentPaymentPeriod) => {
    const hasPayments = getEffectiveCheckedState(period);
    if (hasPayments || isProcessingCheckbox) return;

    const earliestUnpaidIdx = generatedPeriods.findIndex((p) => !getEffectiveCheckedState(p));
    const currentIdx = generatedPeriods.findIndex((p) => p.id === period.id);
    if (currentIdx !== earliestUnpaidIdx) return;

    setEditingDatePeriodId(period.id);
    const existing = periodTransactionDates[period.id] || period.paymentStartDate || new Date().toISOString().split('T')[0];
    setSelectedDate(existing);
  };

  const handleCheckboxChange = async (
    period: InstallmentPaymentPeriod,
    checked: boolean,
  ) => {
    if (!installment?.id || isProcessingCheckbox) return;
    const _tCheck = performance.now();
    const _t1 = performance.now();
    const status = await getInstallmentStatus(installment.id);
    console.log(`[PERF] handleCheckboxChange - getInstallmentStatus: ${Math.round(performance.now() - _t1)}ms`);
    if (status === InstallmentStatus.CLOSED) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Hợp đồng đã đóng' });
      return;
    } else if (status === InstallmentStatus.DELETED) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Hợp đồng đã bị xóa' });
      return;
    }
    // Permission check
    if (checked && !hasPermission('dong_lai_tra_gop')) {
      toast({ variant: 'destructive', title: 'Không có quyền', description: 'Bạn không có quyền đóng lãi' });
      return;
    }
    if (!checked && !hasPermission('huy_dong_lai_tra_gop')) {
      toast({ variant: 'destructive', title: 'Không có quyền', description: 'Bạn không có quyền hủy đóng lãi' });
      return;
    }

    const periodId = period.id;
    setIsProcessingCheckbox(true);

    // optimistic
    setOptimisticUpdates((prev) => ({ ...prev, [periodId]: checked }));
    setLoadingPeriods((prev) => ({ ...prev, [periodId]: true }));

    try {
      const { id: userId } = await getCurrentUser();

      if (checked) {
        // ----- INSERT PAYMENT RECORDS -----
        const _t2 = performance.now();
        const latestPaidDate = await getLatestPaymentPaidDate(installment.id);
        console.log(`[PERF] handleCheckboxChange - getLatestPaymentPaidDate: ${Math.round(performance.now() - _t2)}ms`);
        let startDate: string;
        if (latestPaidDate) {
          const next = new Date(latestPaidDate);
          next.setDate(next.getDate() + 1);
          startDate = next.toISOString().split('T')[0];
        } else {
          startDate = installment.start_date;
        }
        const endDate = period.endDate?.split('T')[0] ?? period.dueDate.split('T')[0];

        const startObj = new Date(startDate);
        const endObj = new Date(endDate);
        const totalDays = Math.floor((endObj.getTime() - startObj.getTime()) / 86400000) + 1;
        if (totalDays <= 0) throw new Error('Ngày này đã được đóng lãi. Bạn có thể tải lại bảng để xem lại');

        // Dùng cached dailyAmounts từ hook — tránh DB round-trip thêm
        const _t3 = performance.now();
        const dailyAmounts = cachedDailyAmounts.length > 0
          ? cachedDailyAmounts
          : await getExpectedMoney(installment.id);
        console.log(`[PERF] handleCheckboxChange - dailyAmounts (${cachedDailyAmounts.length > 0 ? 'CACHE HIT' : 'DB fetch'}): ${Math.round(performance.now() - _t3)}ms`);
        const loanStart = new Date(installment.start_date);

        const cycles: { start: Date; end: Date }[] = [];
        const periodLen = installment.payment_period || 30;
        let currentStart = new Date(startObj);
        while (currentStart <= endObj) {
          let currentEnd = new Date(currentStart);
          currentEnd.setDate(currentStart.getDate() + periodLen - 1);
          if (currentEnd > endObj) currentEnd = new Date(endObj);
          cycles.push({ start: new Date(currentStart), end: new Date(currentEnd) });
          currentStart = new Date(currentEnd);
          currentStart.setDate(currentStart.getDate() + 1);
        }

        const records: any[] = [];
        const isCustom = editingPeriodId === periodId && paymentAmount > 0;
        const ratio = isCustom ? paymentAmount / (period.expectedAmount || 1) : 1;

        cycles.forEach((c, idx) => {
          const cycleDays = Math.floor((c.end.getTime() - c.start.getTime()) / 86400000) + 1;
          for (let d = 0; d < cycleDays; d++) {
            const current = new Date(c.start);
            current.setDate(c.start.getDate() + d);
            const dayIdx = Math.floor((current.getTime() - loanStart.getTime()) / 86400000);
            const base = dailyAmounts[dayIdx] || 0;
            const amount = Math.round(base * ratio);
            let dateStatus: string | null = null;
            if (cycleDays === 1) dateStatus = 'only';
            else if (d === 0) dateStatus = 'start';
            else if (d === cycleDays - 1) dateStatus = 'end';

            records.push({
              installment_id: installment.id,
              transaction_type: 'payment',
              effective_date: current.toISOString(),
              date_status: dateStatus,
              credit_amount: amount,
              debit_amount: 0,
              description: `Thanh toán chu kỳ ${idx + 1}/${cycles.length}`,
              is_deleted: false,
              created_by: userId,
              transaction_date: (() => {
                const t = periodTransactionDates[periodId] || period.paymentStartDate || new Date().toISOString().split('T')[0];
                return new Date(t).toISOString();
              })(),
            });
          }
        });

        const _t4 = performance.now();
        const { error } = await supabase.from('installment_history').upsert(records).select();
        console.log(`[PERF] handleCheckboxChange - upsert ${records.length} records: ${Math.round(performance.now() - _t4)}ms`);
        if (error) throw new Error(error.message);
        // Update payment_due_date
        const _t5 = performance.now();
        const updatedLatestPaidDate = await getLatestPaymentPaidDate(installment.id);
        if (updatedLatestPaidDate) {
          const latestPaidDateObj = new Date(updatedLatestPaidDate);
          const endDate = new Date(installment.start_date || '');
          endDate.setDate(endDate.getDate() + (installment.duration || 0) - 1);
          if (latestPaidDateObj.getTime() >= endDate.getTime()) {
            await updateInstallmentPaymentDueDate(installment.id, null);
          } else {
            const newDueDate = new Date(latestPaidDateObj);
            newDueDate.setDate(newDueDate.getDate() + installment.payment_period);
            await updateInstallmentPaymentDueDate(installment.id, newDueDate.toISOString());
          }
        }
        console.log(`[PERF] handleCheckboxChange - updateDueDate: ${Math.round(performance.now() - _t5)}ms`);
        console.log(`[PERF] handleCheckboxChange CHECK TOTAL: ${Math.round(performance.now() - _tCheck)}ms`);
        toast({ title: 'Thành công', description: `Đã tạo ${records.length} bản ghi thanh toán` });
        setEditingPeriodId(null);
      } else {
        // ----- UNCHECK ----- only latest period
        // Validate first, if the unchecked period has end date before latest paid date, throw error
        const latestPaidDate = await getLatestPaymentPaidDate(installment.id);
        if (latestPaidDate) {
          const latestPaidDateObj = new Date(latestPaidDate);
          const endDate = new Date(period.endDate?.split('T')[0] ?? period.dueDate.split('T')[0]);
          if (endDate.getTime() < latestPaidDateObj.getTime()) {
            toast({ variant: 'destructive', title: 'Ngày này đã được đóng lãi. Bạn có thể tải lại bảng để xem lại' });
            return;
          }
        }
        const checkedPeriods = generatedPeriods.filter((p) => getEffectiveCheckedState(p));
        checkedPeriods.sort((a, b) => b.periodNumber - a.periodNumber);
        if (checkedPeriods.length > 0 && checkedPeriods[0].periodNumber !== period.periodNumber) {
          toast({ variant: 'destructive', title: 'Không thể bỏ đánh dấu', description: `Chỉ huỷ kỳ ${checkedPeriods[0].periodNumber}` });
          return;
        }
        const startDate = period.dueDate.split('T')[0];
        const endDate = period.endDate?.split('T')[0] ?? startDate;
        const { data, error } = await supabase
          .from('installment_history')
          .update({ is_deleted: true, updated_by: (await getCurrentUser()).id, updated_at: new Date().toISOString() })
          .eq('installment_id', installment.id)
          .eq('transaction_type', 'payment')
          .eq('is_deleted', false)
          .gte('effective_date', startDate)
          .lte('effective_date', `${endDate}T23:59:59Z`)
          .select();
        if (error) throw new Error(error.message);
        // Update payment_due_date
        const updatedLatestPaidDate = await getLatestPaymentPaidDate(installment.id);
        if (updatedLatestPaidDate) {
          const latestPaidDateObj = new Date(updatedLatestPaidDate);
          const endDate = new Date(installment.start_date || '');
          endDate.setDate(endDate.getDate() + (installment.duration || 0) - 1);
          if (latestPaidDateObj.getTime() >= endDate.getTime()) {
            await updateInstallmentPaymentDueDate(installment.id, null);
          } else {
            const newDueDate = new Date(latestPaidDateObj);
            newDueDate.setDate(newDueDate.getDate() + installment.payment_period);
            await updateInstallmentPaymentDueDate(installment.id, newDueDate.toISOString());
          }
        }
        else {
          await updateInstallmentPaymentDueDate(installment.id, installment.start_date || '');
        }
        console.log(`[PERF] handleCheckboxChange UNCHECK TOTAL: ${Math.round(performance.now() - _tCheck)}ms`);
        toast({ title: 'Thành công', description: `Đã xoá ${data?.length || 0} bản ghi` });
      }

      // DB ok, clear optimistic
      setOptimisticUpdates((prev) => {
        const n = { ...prev };
        delete n[periodId];
        return n;
      });
      setTimeout(() => handleBackgroundSync(), 100);
    } catch (err: any) {
      // rollback
      setOptimisticUpdates((prev) => {
        const n = { ...prev };
        delete n[periodId];
        return n;
      });
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message || 'Không thể xử lý' });
    } finally {
      setLoadingPeriods((prev) => ({ ...prev, [periodId]: false }));
      setIsProcessingCheckbox(false);
    }
  };

  // earliest unpaid idx
  const earliestUnpaidIdx = generatedPeriods.findIndex((p) => !getEffectiveCheckedState(p));

  return (
    <div className="relative">
      {isBackgroundSyncing && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-[8px] md:text-xs px-2 py-1 rounded-full shadow-lg z-20 flex items-center">
          <div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin mr-1" />
          Đang đồng bộ...
        </div>
      )}
      {isProcessingCheckbox && Object.keys(optimisticUpdates).length === 0 && (
        <div className="absolute inset-0 bg-white bg-opacity-70 z-10 flex items-center justify-center">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-lg flex items-center">
            <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-3" />
            <span className="text-blue-700 font-medium">Đang xử lý thanh toán...</span>
          </div>
        </div>
      )}
      {/* Loading */}
      {loading && generatedPeriods.length === 0 ? (
        <div className="flex items-center justify-center p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
          <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-2" />
          <span className="text-blue-700">Đang tải...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      ) : (
        <div className="overflow-auto mt-2" style={{ maxHeight: '400px' }}>
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-0.5 py-0.5 md:px-2 md:py-2 text-center text-[8px] md:text-sm font-medium text-gray-500 border w-6 md:w-auto">STT</th>
                <th className="px-0.5 py-0.5 md:px-2 md:py-2 text-center text-[8px] md:text-sm font-medium text-gray-500 border">Ngày</th>
                <th className="px-0.5 py-0.5 md:px-2 md:py-2 text-center text-[8px] md:text-sm font-medium text-gray-500 border"><span className="md:hidden">Ngày GD</span><span className="hidden md:inline">Ngày giao dịch</span></th>
                <th className="px-0.5 py-0.5 md:px-2 md:py-2 text-center text-[8px] md:text-sm font-medium text-gray-500 border"><span className="md:hidden">Lãi phí</span><span className="hidden md:inline">Tiền lãi phí</span></th>
                <th className="px-0.5 py-0.5 md:px-2 md:py-2 text-center text-[8px] md:text-sm font-medium text-gray-500 border">Tổng</th>
                <th className="px-0.5 py-0.5 md:px-2 md:py-2 text-center text-[8px] md:text-sm font-medium text-gray-500 border"><span className="md:hidden">Trả</span><span className="hidden md:inline">Khách trả</span></th>
                <th className="px-0.5 py-0.5 md:px-2 md:py-2 text-center text-[8px] md:text-sm font-medium text-gray-500 border w-4 md:w-10" />
              </tr>
            </thead>
            <tbody>
              {generatedPeriods.map((period, idx) => {
                const expected = period.expectedAmount || 0;
                const actual = period.actualAmount || expected;
                const hasPayments = getEffectiveCheckedState(period);
                const isEditing = editingPeriodId === period.id;
                const isLoading = loadingPeriods[period.id];
                const isDisabled = installment.status === "CLOSED" || installment.status === "DELETED";
                const isEarliestUnpaid = idx === earliestUnpaidIdx;

                // Determine latest checked period to decide lock UI
                const checkedPeriods = generatedPeriods.filter(p => getEffectiveCheckedState(p));
                checkedPeriods.sort((a,b) => b.periodNumber - a.periodNumber);
                const isLatestChecked = checkedPeriods.length > 0 && checkedPeriods[0].periodNumber === period.periodNumber;

                return (
                  <tr key={period.id} className="hover:bg-gray-50">
                    <td className="px-0.5 py-0.5 md:px-2 md:py-2 text-center border text-[8px] md:text-sm">{period.periodNumber}</td>
                    <td className="px-0.5 py-0.5 md:px-2 md:py-2 text-center border text-[8px] md:text-sm">
                      {formatDate(period.dueDate)} → {formatDate(period.endDate)}
                    </td>
                    <td className="px-0.5 py-0.5 md:px-2 md:py-2 text-center border">
                      {editingDatePeriodId === period.id ? (
                        <DatePicker
                          value={selectedDate}
                          onChange={(date) => {
                            setSelectedDate(date);
                            setPeriodTransactionDates((prev) => ({ ...prev, [period.id]: date }));
                            setEditingDatePeriodId(null);
                          }}
                          className="w-16 md:w-32 text-[8px] md:text-sm text-center mx-auto"
                          maxDate={format(new Date(), 'yyyy-MM-dd')}
                          disabled={isDisabled}
                        />
                      ) : (
                        <span
                          className={`text-[8px] md:text-sm ${!hasPayments && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? 'text-blue-500 cursor-pointer' : 'text-gray-600'}`}
                          onClick={!hasPayments && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? () => startDateEditing(period) : undefined}
                        >
                          {(() => {
                            const dateStr = periodTransactionDates[period.id] || period.paymentStartDate || new Date().toISOString().split('T')[0];
                            return formatDate(dateStr);
                          })()}
                        </span>
                      )}
                    </td>
                    <td className="px-0.5 py-0.5 md:px-2 md:py-2 text-right border text-[8px] md:text-sm">{formatCurrency(expected)}</td>
                    <td className="px-0.5 py-0.5 md:px-2 md:py-2 text-right border text-[8px] md:text-sm">{formatCurrency(expected)}</td>
                    <td className="px-0.5 py-0.5 md:px-2 md:py-2 text-right border">
                      {isEditing ? (
                        <div className="flex items-center justify-end space-x-1">
                          <input
                            type="text"
                            className="border rounded w-16 md:w-24 px-1 py-0.5 text-right text-[8px] md:text-sm"
                            value={formatNumberInput(paymentAmount)}
                            onChange={(e) => setPaymentAmount(parseFormattedNumber(e.target.value))}
                            autoFocus
                            onFocus={e => {
                              if (!paymentAmount || paymentAmount === 0) e.target.select();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCheckboxChange(period, true);
                              else if (e.key === 'Escape') cancelEditing();
                            }}
                          />
                          <button className="text-[8px] md:text-xs bg-blue-500 text-white px-1 py-0.5 rounded" onClick={() => handleCheckboxChange(period, true)}>
                            OK
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`text-[8px] md:text-sm ${!hasPayments && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? 'text-blue-500 cursor-pointer' : 'text-gray-600'}`}
                          onClick={!hasPayments && !isDisabled && !isProcessingCheckbox && isEarliestUnpaid ? () => startEditing(period) : undefined}
                        >
                          {formatCurrency(actual)}
                        </span>
                      )}
                    </td>
                    <td className="px-0.5 py-0.5 md:px-2 md:py-2 text-center border">
                      {isLoading ? (
                        <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mx-auto" />
                      ) : (
                        (() => {
                          if (hasPayments && !isLatestChecked) {
                            return (
                              <div className="flex items-center justify-center" title="Không thể bỏ đánh dấu kỳ này vì chưa phải kỳ gần nhất">
                                <div className="relative">
                                  <Checkbox checked={true} disabled={true} className="opacity-60 cursor-not-allowed" />
                                  <span className="absolute -top-1 -right-1 text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <Checkbox
                              checked={hasPayments}
                              disabled={isDisabled || isProcessingCheckbox}
                              onCheckedChange={(c) => handleCheckboxChange(period, !!c)}
                            />
                          );
                        })()
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
} 