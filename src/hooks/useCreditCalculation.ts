// src/hooks/useCreditCalculations.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatus } from '@/models/credit';
import { useStore } from '@/contexts/StoreContext';
import { calculateCreditMetrics } from '@/lib/Credits/calculate_credit_metrics';
import { startPerfTimer } from '@/lib/perf-debug';

// Interface cho dữ liệu tài chính tổng hợp
export interface StoreFinancialData {
  totalFund: number;
  availableFund: number;
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

// Interface cho chi tiết từng credit (cho CreditsTable)
export interface CreditFinancialDetail {
  creditId: string;
  actualLoanAmount: number;
  oldDebt: number;
  expectedProfit: number;
  paidInterest: number;
  interestToday: number;
  nextPayment: string | null;
  isCompleted: boolean;
  hasPaid: boolean;
  loading: boolean;
  latestPaidDate: string | null;
}

export function useCreditCalculations() {
  const [summary, setSummary] = useState<StoreFinancialData | null>(null);
  const [details, setDetails] = useState<Record<string, CreditFinancialDetail>>({});
  const [loading, setLoading] = useState(true);
  const { currentStore } = useStore();
  
  const fetchAllData = async () => {
    const endFetchAllData = startPerfTimer('useCreditCalculations.fetchAllData', {
      context: { storeId: currentStore?.id || null },
    });
    try {
      setLoading(true);
      
      const storeId = currentStore?.id || '1';
      
      // 1. investment tĩnh từ stores; cash fund event-sourced qua RPC.
      const endStoreQuery = startPerfTimer('useCreditCalculations.fetchAllData.queryStore');
      const [{ data: storeData }, { data: cashFundData }] = await Promise.all([
        supabase.from('stores').select('investment').eq('id', storeId).single(),
        (supabase as any).rpc('calc_cash_fund_as_of', { p_store_id: storeId }),
      ]);
      endStoreQuery();
      
      // 2. Lấy danh sách credits đang hoạt động từ view (bao gồm ON_TIME, OVERDUE, LATE_INTEREST)
      const endActiveCreditsQuery = startPerfTimer('useCreditCalculations.fetchAllData.queryActiveCredits');
      const { data: activeCreditsData } = await supabase
        .from('credits_by_store')
        .select('id, loan_amount, loan_date, loan_period')
        .eq('store_id', storeId)
        .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST']);
      endActiveCreditsQuery();
      
      // 3. Lấy danh sách credits đã đóng từ view
      const endClosedCreditsQuery = startPerfTimer('useCreditCalculations.fetchAllData.queryClosedCredits');
      const { data: closedCreditsData } = await supabase
        .from('credits_by_store')
        .select('id, loan_amount, loan_date, loan_period')
        .eq('store_id', storeId)
        .eq('status_code', 'CLOSED');
      endClosedCreditsQuery();
      
      let totalLoan = 0;
      let totalOldDebt = 0;
      let totalProfit = 0;
      let totalCollectedInterest = 0;
      const newDetails: Record<string, CreditFinancialDetail> = {};
      
      /* ---------- 4. RPC lấy paidInterest (2 phiên bản):
           a) interestRangeMap: theo start_date & end_date (dùng cho tổng hợp)
           b) interestTotalMap: toàn thời gian (dùng cho chi tiết từng credit) */

      const interestRangeMap = new Map<string, number>();
      const interestTotalMap = new Map<string, number>();
      const activeIds  = activeCreditsData?.map(c => c.id).filter((id): id is string => id !== null) || [];
      const closedIds  = closedCreditsData?.map(c => c.id).filter((id): id is string => id !== null) || [];
      const allIds     = [...activeIds, ...closedIds];

      if (allIds.length) {
        /* (a) date-range */
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        const endInterestRangeQuery = startPerfTimer('useCreditCalculations.fetchAllData.rpcPaidInterestRange', {
          context: { credits: allIds.length },
        });
        const { data: interestRowsR } = await supabase.rpc('get_paid_interest', {
          p_credit_ids: allIds,
          p_start_date: start.toISOString(),
          p_end_date  : end.toISOString(),
        });
        endInterestRangeQuery();
        interestRowsR?.forEach((r: any) =>
          interestRangeMap.set(r.credit_id, Number(r.paid_interest || 0)));

        /* (b) total */
        const endInterestTotalQuery = startPerfTimer('useCreditCalculations.fetchAllData.rpcPaidInterestTotal', {
          context: { credits: allIds.length },
        });
        const { data: interestRowsT } = await supabase.rpc('get_paid_interest', {
          p_credit_ids: allIds,
        });
        endInterestTotalQuery();
        interestRowsT?.forEach((r: any) =>
          interestTotalMap.set(r.credit_id, Number(r.paid_interest || 0)));
      }

      const endPrincipalQuery = startPerfTimer('useCreditCalculations.fetchAllData.rpcCurrentPrincipal', {
        context: { credits: allIds.length },
      });
      const { data: principalRows } = await supabase.rpc('get_current_principal', {
        p_credit_ids: allIds,
      });
      endPrincipalQuery();
      const principalMap = new Map<string, number>();
      principalRows?.forEach((r: { credit_id: string; current_principal: number }) => {
        principalMap.set(r.credit_id, Number(r.current_principal));
      });

      // 5. RPC lấy old debt
      const endOldDebtQuery = startPerfTimer('useCreditCalculations.fetchAllData.rpcOldDebt', {
        context: { credits: activeIds.length },
      });
      const { data: debtRows } = await supabase.rpc('get_old_debt', {
        p_credit_ids: activeIds,
      });
      endOldDebtQuery();
      const debtMap = new Map<string, number>();
      debtRows?.forEach((r: { credit_id: string; old_debt: number }) =>
        debtMap.set(r.credit_id, Number(r.old_debt || 0))
      );

      /* ---------- 6. RPC lấy expectedProfit & interestToday ---------- */
      const expectedMap = new Map<string, number>();
      const todayMap = new Map<string, number>();

      if (allIds.length) {
        const endExpectedInterestQuery = startPerfTimer('useCreditCalculations.fetchAllData.rpcExpectedInterest', {
          context: { credits: allIds.length },
        });
        const { data: expRows, error: expErr } = await (supabase.rpc as any)('get_expected_interest', {
          p_credit_ids: allIds,
        });
        endExpectedInterestQuery();
        if (!expErr && Array.isArray(expRows)) {
          expRows.forEach((r: any) => {
            expectedMap.set(r.credit_id, Number(r.expected_profit || 0));
            todayMap.set(r.credit_id, Number(r.interest_today || 0));
          });
        }
      }

      /* ---------- 7.1. RPC lấy latest payment paid date cho tất cả credit ---------- */
      const latestPaidMap = new Map<string, string | null>();
      if (allIds.length) {
        const endLatestPaidQuery = startPerfTimer('useCreditCalculations.fetchAllData.rpcLatestPaymentPaidDates', {
          context: { credits: allIds.length },
        });
        const { data: latestPaidRows, error: latestPaidErr } = await (supabase.rpc as any)('get_latest_payment_paid_dates', {
          p_credit_ids: allIds,
        });
        endLatestPaidQuery();
        if (!latestPaidErr && Array.isArray(latestPaidRows)) {
          latestPaidRows.forEach((r: any) => {
            latestPaidMap.set(r.credit_id, r.latest_paid_date || null);
          });
        }
      }

      /* ---------- 7. RPC lấy thông tin kỳ thanh toán tiếp theo ---------- */
      const nextMap = new Map<string, { nextDate: string | null; isCompleted: boolean; hasPaid: boolean }>();
      if (activeIds.length) {
        const endNextPaymentQuery = startPerfTimer('useCreditCalculations.fetchAllData.rpcNextPaymentInfo', {
          context: { credits: activeIds.length },
        });
        const { data: npRows, error: npErr } = await (supabase.rpc as any)('get_next_payment_info', {
          p_credit_ids: activeIds,
        });
        endNextPaymentQuery();
        if (!npErr && Array.isArray(npRows)) {
          npRows.forEach((r: any) => {
            nextMap.set(r.credit_id, {
              nextDate: r.next_date,
              isCompleted: r.is_completed,
              hasPaid: r.has_paid,
            });
          });
        }
      }
        
      const endCalculateMetrics = startPerfTimer('useCreditCalculations.fetchAllData.calculateCreditMetrics', {
        context: { credits: (activeCreditsData?.length || 0) + (closedCreditsData?.length || 0) },
      });
      const results = await Promise.all(
        [...(activeCreditsData || []), ...(closedCreditsData || [])]
          .filter(c => c.id !== null && c.loan_amount !== null && c.loan_date !== null && c.loan_period !== null)
          .map(c =>
            calculateCreditMetrics(c as any, {
              principalMap,
              interestMap: interestTotalMap,
              debtMap,
              expectedMap,
              todayMap,
            })
          )
      );
      endCalculateMetrics();
        
        // Aggregate results
        results.forEach(result => {
          if (result) {
            newDetails[result.creditId] = {
              creditId: result.creditId,
              actualLoanAmount: result.actualLoanAmount,
              oldDebt: result.oldDebt,
              expectedProfit: result.expectedProfit,
              paidInterest: result.paidInterest,
              interestToday: result.interestToday,
              nextPayment: nextMap.get(result.creditId)?.nextDate || null,
              isCompleted: nextMap.get(result.creditId)?.isCompleted || false,
              hasPaid: nextMap.get(result.creditId)?.hasPaid || false,
              loading: false,
              latestPaidDate: latestPaidMap.get(result.creditId) || null
            };
            
            totalLoan += result.summaryLoan;
            totalOldDebt += result.summaryDebt;
            totalProfit += result.summaryProfit;
            totalCollectedInterest += interestRangeMap.get(result.creditId) ?? 0;
          }
        });
      
      // Cộng thêm lãi phí của các credit đã đóng
      closedIds.forEach(id => {
        totalCollectedInterest += interestRangeMap.get(id) ?? 0;
      });
      
      /* ---------- 8. Status calculation removed - now handled by credits_by_store view */
      
      // 7. Set results
      setSummary({
        totalFund: storeData?.investment || 0,
        availableFund: Number(cashFundData) || 0,
        totalLoan: Math.round(totalLoan),
        oldDebt: Math.round(totalOldDebt),
        profit: Math.round(totalProfit),
        collectedInterest: Math.round(totalCollectedInterest)
      });
      
      setDetails(newDetails);
      
    } catch (error) {
      console.error('Error in useCreditCalculations:', error);
    } finally {
      setLoading(false);
      endFetchAllData();
    }
  };
  
  useEffect(() => {
    fetchAllData();
  }, [currentStore?.id]);
  
  return {
    summary,
    details,
    loading,
    refresh: fetchAllData
  };
}