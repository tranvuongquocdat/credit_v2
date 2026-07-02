import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetch-all';
import { PawnStatus } from '@/models/pawn';
import { CreditStatus } from '@/models/credit';
import { InstallmentStatus } from '@/models/installment';
import { calculatePawnMetrics } from '@/lib/Pawns/calculate_pawn_metrics';
import { calculateCreditMetrics } from '@/lib/Credits/calculate_credit_metrics';
import { calculateInstallmentMetrics } from '@/lib/Installments/calculate_installment_metrics';

export interface FinancialSummary {
  totalLoan: number;
  oldDebt: number;
  profit: number;
  collectedInterest: number;
}

export async function getPawnFinancialsForStore(storeId: string): Promise<FinancialSummary> {
  // 1 & 2. Lấy danh sách pawns đang hoạt động và đã đóng song song
  // (fetchAllRows để không bị PostgREST cắt 1000 dòng khi store lớn)
  const [activePawnsData, closedPawnsData] = await Promise.all([
    fetchAllRows(
      supabase
        .from('pawns_by_store')
        .select('id, loan_amount, loan_date, loan_period')
        .eq('store_id', storeId)
        .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST'])
        .order('id')
    ),
    fetchAllRows(
      supabase
        .from('pawns_by_store')
        .select('id')
        .eq('store_id', storeId)
        .eq('status_code', 'CLOSED')
        .order('id')
    )
  ]);

  let totalLoan = 0;
  let totalOldDebt = 0;
  let totalProfit = 0;
  let totalCollectedInterest = 0;

      
  /* ---------- 4. RPC duy nhất lấy paidInterest cho active + closed ---------- */
  const interestMap = new Map<string, number>();
  const activeIds  = activePawnsData?.map(c => c.id).filter((id): id is string => id !== null) || [];
  const closedIds  = closedPawnsData?.map(c => c.id).filter((id): id is string => id !== null) || [];
  const allIds     = [...activeIds, ...closedIds];
  
  // Chạy tất cả RPC calls song song để tối ưu hiệu suất
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // end = CUỐI ngày cuối tháng (23:59:59.999), tránh RPC lọc created_at <= end cắt mất khoản thu ngày cuối tháng.
  const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

  // fetchAllRows cho cả response RPC: PostgREST cũng cắt 1000 dòng với RPC trả setof
  const [
    interestRows,
    principalRows,
    debtRows,
    expRows,
    npRows
  ] = await Promise.all([
    // RPC lấy paid interest
    allIds.length ? fetchAllRows(supabase.rpc('get_pawn_paid_interest', {
      p_pawn_ids: allIds,
      p_start_date: start.toISOString(),
      p_end_date: end.toISOString(),
    })) : Promise.resolve([]),
    // RPC lấy current principal
    allIds.length ? fetchAllRows(supabase.rpc('get_pawn_current_principal', {
      p_pawn_ids: allIds,
    })) : Promise.resolve([]),
    // RPC lấy old debt
    activeIds.length ? fetchAllRows(supabase.rpc('get_pawn_old_debt', {
      p_pawn_ids: activeIds,
    })) : Promise.resolve([]),
    // RPC lấy expected interest
    allIds.length ? fetchAllRows((supabase.rpc as any)('get_pawn_expected_interest', {
      p_pawn_ids: allIds,
    })) : Promise.resolve([]),
    // RPC lấy next payment info
    activeIds.length ? fetchAllRows((supabase.rpc as any)('get_pawn_next_payment_info', {
      p_pawn_ids: activeIds,
    })) : Promise.resolve([])
  ]);

  // Process interest data
  if (Array.isArray(interestRows)) {
    interestRows.forEach((r: any) =>
      interestMap.set(r.pawn_id, Number(r.paid_interest || 0)));
  }

  // Process principal data
  const principalMap = new Map<string, number>();
  principalRows?.forEach((r: { pawn_id: string; current_principal: number }) => {
    principalMap.set(r.pawn_id, Number(r.current_principal));
  });

  // Process debt data
  const debtMap = new Map<string, number>();
  debtRows?.forEach((r: { pawn_id: string; old_debt: number }) =>
    debtMap.set(r.pawn_id, Number(r.old_debt || 0))
  );

  // Process expected interest data
  const expectedMap = new Map<string, number>();
  const todayMap = new Map<string, number>();
  if (Array.isArray(expRows)) {
    expRows.forEach((r: any) => {
      expectedMap.set(r.pawn_id, Number(r.expected_profit || 0));
      todayMap.set(r.pawn_id, Number(r.interest_today || 0));
    });
  }

  // Process next payment info
  const nextMap = new Map<string, { nextDate: string | null; isCompleted: boolean; hasPaid: boolean }>();
  if (Array.isArray(npRows)) {
    npRows.forEach((r: any) => {
      nextMap.set(r.pawn_id, {
        nextDate: r.next_date,
        isCompleted: r.is_completed,
        hasPaid: r.has_paid,
      });
    });
  }
    
    const validPawnData = (activePawnsData || [])
      .filter((c): c is { id: string; loan_amount: number; loan_date: string; loan_period: number } => 
        c?.id !== null && c?.loan_amount !== null && c?.loan_date !== null && c?.loan_period !== null
      );

    const results = await Promise.all(
      validPawnData.map(c =>
        calculatePawnMetrics(c, {
          principalMap,
          interestMap,
          debtMap,
          expectedMap,
          todayMap,
        })
      )
    );
    
    // Aggregate results
    results.forEach(result => {
      if (result) {
        totalLoan += result.summaryLoan;
        totalOldDebt += result.summaryDebt;
        totalProfit += result.summaryProfit;
        totalCollectedInterest += result.paidInterest;
      }
    });
  
  // Cộng thêm lãi phí của các credit đã đóng
  closedIds.forEach(id => {
    totalCollectedInterest += interestMap.get(id) ?? 0;
  });

  return {
    totalLoan: Math.round(totalLoan),
    oldDebt: Math.round(totalOldDebt),
    profit: Math.round(totalProfit),
    collectedInterest: Math.round(totalCollectedInterest)
  };
}

export async function getCreditFinancialsForStore(storeId: string): Promise<FinancialSummary> {
  // 1 & 2. Lấy danh sách credits đang hoạt động và đã đóng song song
  // (fetchAllRows để không bị PostgREST cắt 1000 dòng khi store lớn)
  const [activeCreditsData, closedCreditsData] = await Promise.all([
    fetchAllRows(
      supabase
        .from('credits_by_store')
        .select('id, loan_amount, loan_date, loan_period')
        .eq('store_id', storeId)
        .in('status_code', ['ON_TIME', 'OVERDUE', 'LATE_INTEREST'])
        .order('id')
    ),
    fetchAllRows(
      supabase
        .from('credits_by_store')
        .select('id')
        .eq('store_id', storeId)
        .eq('status_code', 'CLOSED')
        .order('id')
    )
  ]);

  let totalLoan = 0;
  let totalOldDebt = 0;
  let totalProfit = 0;
  let totalCollectedInterest = 0;

      
  /* ---------- 4. RPC duy nhất lấy paidInterest cho active + closed ---------- */
  const interestMap = new Map<string, number>();
  const activeIds  = activeCreditsData?.map(c => c.id).filter((id): id is string => id !== null) || [];
  const closedIds  = closedCreditsData?.map(c => c.id).filter((id): id is string => id !== null) || [];
  const allIds     = [...activeIds, ...closedIds];
  
  // Chạy tất cả RPC calls song song để tối ưu hiệu suất
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // end = CUỐI ngày cuối tháng (23:59:59.999), tránh RPC lọc created_at <= end cắt mất khoản thu ngày cuối tháng.
  const end   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

  // fetchAllRows cho cả response RPC: PostgREST cũng cắt 1000 dòng với RPC trả setof
  const [
    interestRows,
    principalRows,
    debtRows,
    expRows,
    npRows
  ] = await Promise.all([
    // RPC lấy paid interest
    allIds.length ? fetchAllRows(supabase.rpc('get_paid_interest', {
      p_credit_ids: allIds,
      p_start_date: start.toISOString(),
      p_end_date: end.toISOString(),
    })) : Promise.resolve([]),
    // RPC lấy current principal
    allIds.length ? fetchAllRows(supabase.rpc('get_current_principal', {
      p_credit_ids: allIds,
    })) : Promise.resolve([]),
    // RPC lấy old debt
    activeIds.length ? fetchAllRows(supabase.rpc('get_old_debt', {
      p_credit_ids: activeIds,
    })) : Promise.resolve([]),
    // RPC lấy expected interest
    allIds.length ? fetchAllRows((supabase.rpc as any)('get_expected_interest', {
      p_credit_ids: allIds,
    })) : Promise.resolve([]),
    // RPC lấy next payment info
    activeIds.length ? fetchAllRows((supabase.rpc as any)('get_next_payment_info', {
      p_credit_ids: activeIds,
    })) : Promise.resolve([])
  ]);

  // Process interest data
  if (Array.isArray(interestRows)) {
    interestRows.forEach((r: any) =>
      interestMap.set(r.credit_id, Number(r.paid_interest || 0)));
  }

  // Process principal data
  const principalMap = new Map<string, number>();
  principalRows?.forEach((r: { credit_id: string; current_principal: number }) => {
    principalMap.set(r.credit_id, Number(r.current_principal));
  });

  // Process debt data
  const debtMap = new Map<string, number>();
  debtRows?.forEach((r: { credit_id: string; old_debt: number }) =>
    debtMap.set(r.credit_id, Number(r.old_debt || 0))
  );

  // Process expected interest data
  const expectedMap = new Map<string, number>();
  const todayMap = new Map<string, number>();
  if (Array.isArray(expRows)) {
    expRows.forEach((r: any) => {
      expectedMap.set(r.credit_id, Number(r.expected_profit || 0));
      todayMap.set(r.credit_id, Number(r.interest_today || 0));
    });
  }

  // Process next payment info
  const nextMap = new Map<string, { nextDate: string | null; isCompleted: boolean; hasPaid: boolean }>();
  if (Array.isArray(npRows)) {
    npRows.forEach((r: any) => {
      nextMap.set(r.credit_id, {
        nextDate: r.next_date,
        isCompleted: r.is_completed,
        hasPaid: r.has_paid,
      });
    });
  }
    
    const results = await Promise.all(
    (activeCreditsData || [])
      .filter(c => c.id !== null && c.loan_amount !== null && c.loan_date !== null && c.loan_period !== null)
      .map(c =>
        calculateCreditMetrics(c as any, {
          principalMap,
          interestMap,
          debtMap,
          expectedMap,
          todayMap,
        })
      )
  );
    
    // Aggregate results
    results.forEach(result => {
      if (result) {
        totalLoan += result.summaryLoan;
        totalOldDebt += result.summaryDebt;
        totalProfit += result.summaryProfit;
        totalCollectedInterest += result.paidInterest;
      }
    });
  
  // Cộng thêm lãi phí của các credit đã đóng
  closedIds.forEach(id => {
    totalCollectedInterest += interestMap.get(id) ?? 0;
  });

  return {
    totalLoan: Math.round(totalLoan),
    oldDebt: Math.round(totalOldDebt),
    profit: Math.round(totalProfit),
    collectedInterest: Math.round(totalCollectedInterest)
  };
}

export async function getInstallmentFinancialsForStore(storeId: string): Promise<FinancialSummary> {
  // 1. Lấy danh sách installments đang hoạt động (phân trang tránh cắt 1000 dòng)
  //    + tổng "lãi phí đã thu" của TẤT CẢ hợp đồng qua RPC store-level
  //    (thay cách cũ truyền mảng id closed — bị cắt 1000 khi store lớn, vd Nam sms 1178 HĐ closed)
  const [activeInstallments, { data: storeProfitData }] = await Promise.all([
    fetchAllRows(
      supabase
        .from('installments_by_store')
        .select(`
          id,
          contract_code,
          down_payment,
          installment_amount,
          loan_date,
          loan_period,
          status,
          store_id,
          debt_amount
        `)
        .eq('status', InstallmentStatus.ON_TIME)
        .eq('store_id', storeId)
        .order('id')
    ),
    (supabase as any).rpc('rpc_store_installment_collected_profit', { p_store_id: storeId })
  ]);

  const activeIds = activeInstallments?.map((it: any) => it.id).filter((id: any): id is string => id !== null) || [];

  let totalLoan = 0;
  let totalOldDebt = 0;
  let expectedProfit = 0;
  const collectedProfit = Number(storeProfitData || 0);

  // 2. Tính toán cho hợp đồng đang hoạt động
  if (activeInstallments && activeInstallments.length > 0) {
    // Chạy 3 RPC calls song song để tối ưu hiệu suất (phân trang response tránh cắt 1000 dòng)
    const [debtRows, paidRows, profitRows] = await Promise.all([
      fetchAllRows(supabase.rpc('get_installment_old_debt', { p_installment_ids: activeIds })),
      fetchAllRows(supabase.rpc('installment_get_paid_amount', { p_installment_ids: activeIds })),
      fetchAllRows(supabase.rpc('installment_get_collected_profit', { p_installment_ids: activeIds }))
    ]);

    /* xây 3 map rồi truyền xuống calculateInstallmentMetrics */
    const debtMap   = new Map(debtRows?.map((r: any) => [r.installment_id, Number(r.old_debt)]));
    const paidMap   = new Map(paidRows?.map((r: any) => [r.installment_id, Number(r.paid_amount)]));
    const profitMap = new Map(profitRows?.map((r: any) => [r.installment_id, Number(r.profit_collected)]));

    const results = await Promise.all(
      activeInstallments.map((installment: any) => calculateInstallmentMetrics(installment, { debtMap, paidMap, profitMap }))
    );

    results.forEach((result, idx) => {
      const id = activeInstallments[idx].id;
      const oldDebtVal = debtMap.get(id ?? '') ?? 0;       // dùng nợ cũ lấy từ RPC
      totalOldDebt   += oldDebtVal;

      if (result) {
        totalLoan       += result.loanAmount;
        expectedProfit  += result.expectedProfitAmount;
      }
    });
  }

  return {
    totalLoan: totalLoan,
    oldDebt: totalOldDebt,
    profit: expectedProfit,
    collectedInterest: collectedProfit
  };
}