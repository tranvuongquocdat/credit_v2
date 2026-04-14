import { useEffect, useState } from "react";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { getinstallmentPaymentHistory } from "@/lib/Installments/payment_history";
import { getExpectedMoney } from "@/lib/Installments/get_expected_money";
import { convertFromHistoryToTimeArrayWithStatus } from "@/lib/Installments/convert_from_history_to_time_array";

/**
 * Hook to generate payment periods for an installment contract.
 * It mirrors the logic used in Credits/PaymentTab so the heavy computation
 * lives inside the tab itself instead of the parent modal.
 */
export function useInstallmentPaymentPeriods(
  installmentId: string | undefined,
  loanStartDate: string | undefined,
  paymentPeriod: number | undefined,
  refreshKey: number = 0
) {
  const [periods, setPeriods] = useState<InstallmentPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyAmounts, setDailyAmounts] = useState<number[]>([]);

  useEffect(() => {
    if (!installmentId || !loanStartDate) return;

    let isCancelled = false;

    async function generate() {
      setLoading(true);
      setError(null);

      try {
        // 1. History
        const allPaymentHistory = await getinstallmentPaymentHistory(installmentId!);
        const paymentHistory = allPaymentHistory.filter((r) => !r.is_deleted);

        // 2. Daily expected amounts
        const dailyAmounts = await getExpectedMoney(installmentId!);
        if (!isCancelled) setDailyAmounts(dailyAmounts);

        // 3. Determine loan end date based on length of dailyAmounts
        const startDateObj = new Date(loanStartDate!);
        const endDateObj = new Date(startDateObj);
        endDateObj.setDate(startDateObj.getDate() + dailyAmounts.length - 1);
        const loanEndDate = endDateObj.toISOString().split("T")[0];

        // 4. Split to periods + statuses
        const periodLen = paymentPeriod || 30;
        const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
          loanStartDate!,
          loanEndDate,
          periodLen,
          paymentHistory,
          paymentHistory
        );

        // 5. Build InstallmentPaymentPeriod list
        const res: InstallmentPaymentPeriod[] = [];
        const loanStart = new Date(loanStartDate!);

        timePeriods.forEach((tp, idx) => {
          const [sDate, eDate] = tp;
          const isChecked = statuses[idx];
          const periodNumber = idx + 1;

          const sObj = new Date(sDate);
          const eObj = new Date(eDate);

          const startIdx = Math.floor((sObj.getTime() - loanStart.getTime()) / 86400000);
          const endIdx = Math.floor((eObj.getTime() - loanStart.getTime()) / 86400000);

          let expected = 0;
          for (let i = startIdx; i <= endIdx && i < dailyAmounts.length; i++) {
            if (i >= 0) expected += dailyAmounts[i];
          }

          let actual = 0;
          let transactionDate = "";
          if (isChecked) {
            const payments = paymentHistory.filter((p) => {
              const pd = p.effective_date?.split("T")[0] || "";
              const s = sDate.split("T")[0];
              const e = eDate.split("T")[0];
              return pd >= s && pd <= e;
            });
            actual = payments.reduce((sum, p) => sum + (p.credit_amount || 0) - (p.debit_amount || 0), 0);
            transactionDate = payments[0]?.transaction_date?.split("T")[0] ?? "";
          }

          res.push({
            id: isChecked ? `db-${periodNumber}` : `generated-${periodNumber}`,
            installmentId: installmentId!,
            periodNumber,
            dueDate: sObj.toISOString(),
            endDate: eObj.toISOString(),
            expectedAmount: Math.round(expected),
            actualAmount: Math.round(actual),
            paymentStartDate: isChecked ? transactionDate : undefined,
            isOverdue: false,
            daysOverdue: 0,
          });
        });

        if (!isCancelled) setPeriods(res);
      } catch (err: any) {
        if (!isCancelled) setError(err.message || "Unknown error");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    generate();

    return () => {
      isCancelled = true;
    };
  }, [installmentId, loanStartDate, paymentPeriod, refreshKey]);

  return { periods, loading, error, dailyAmounts };
} 