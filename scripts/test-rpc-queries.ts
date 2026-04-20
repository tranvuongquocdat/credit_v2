/**
 * Test script: So sánh kết quả RPC query với fetchAllData logic hiện tại
 *
 * Chạy:
 *   npx tsx scripts/test-rpc-queries.ts
 *   TEST_RPC_TARGET=installment npx tsx scripts/test-rpc-queries.ts
 *   TEST_RPC_TARGET=pawn npx tsx scripts/test-rpc-queries.ts
 *   TEST_RPC_TARGET=fund npx tsx scripts/test-rpc-queries.ts
 *   TEST_RPC_TARGET=transactions npx tsx scripts/test-rpc-queries.ts
 *   TEST_RPC_TARGET=all npx tsx scripts/test-rpc-queries.ts
 *
 * Hoặc: npx tsx scripts/test-rpc-installment-queries.ts (chỉ trả góp)
 *        npx tsx scripts/test-rpc-pawn-queries.ts (chỉ cầm đồ)
 *        npx tsx scripts/test-rpc-fund-queries.ts (chỉ nguồn vốn)
 *        npx tsx scripts/test-rpc-transactions-queries.ts (chỉ thu chi — mặc định 2025-08-01 → 2025-08-31 nếu không set TEST_START_DATE / TEST_END_DATE)
 *
 * Biến môi trường: `.env.local` (NEXT_PUBLIC_SUPABASE_URL, key, TEST_STORE_ID, …)
 *
 * TEST_RPC_TARGET: `credit` (mặc định) | `installment` | `pawn` | `fund` | `transactions` | `all`
 *
 * Script này:
 * 1. Chạy RPC function mới (GROUP BY)
 * 2. Chạy logic cũ (fetchAllData + processItems thuần)
 * 3. So sánh kết quả — phải GIỐNG NHAU
 *
 * Kết quả so sánh được in ra console:
 *  - Rows khớp: ✓
 *  - Rows khác: ✗ (chi tiết diff)
 *  - Missing / Extra rows
 */

import { createClient } from '@supabase/supabase-js';
import { startOfDay, endOfDay, parse } from 'date-fns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');

// Nạp biến môi trường từ .env.local (và các file .env khác theo thứ tự của Next.js)
loadEnvConfig(projectDir);

// ─────────────────────────────────────────────
// CONFIG — sửa các giá trị này trước khi chạy
// ─────────────────────────────────────────────
const rawTarget = (process.env.TEST_RPC_TARGET ?? 'credit').toLowerCase();
const testRpcTarget:
  | 'credit'
  | 'installment'
  | 'pawn'
  | 'fund'
  | 'transactions'
  | 'all' =
  rawTarget === 'installment'
    ? 'installment'
    : rawTarget === 'pawn'
      ? 'pawn'
      : rawTarget === 'fund'
        ? 'fund'
        : rawTarget === 'transactions'
          ? 'transactions'
          : rawTarget === 'all'
            ? 'all'
            : 'credit';

const CONFIG = {
  supabaseUrl:   process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey:   process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  storeId:       process.env.TEST_STORE_ID ?? '729a9ee8-e0b5-436f-8a59-706395b11646',
  startDate:     process.env.TEST_START_DATE ?? '2026-04-18',  // yyyy-MM-dd
  endDate:       process.env.TEST_END_DATE   ?? '2026-04-18',  // yyyy-MM-dd
  // Bật true để so sánh với logic cũ (fetchAllData + processItems)
  // Bật false để chỉ chạy RPC và in kết quả
  compareWithOldLogic: true,
  testRpcTarget,
};
// ─────────────────────────────────────────────

if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
  console.error('❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// ─────────────────────────────────────────────
// Helper: parse date range
// ─────────────────────────────────────────────
function getDateRange(startDate: string, endDate: string) {
  const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
  const endDateObj   = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
  return {
    startDateISO: startDateObj.toISOString(),
    endDateISO:   endDateObj.toISOString(),
  };
}

// ─────────────────────────────────────────────
// Helper: fetchAllData (logic cũ)
// ─────────────────────────────────────────────
async function fetchAllData(
  query: any,
  pageSize = 1000,
): Promise<unknown[]> {
  let allData: unknown[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) { console.error('Error:', error); break; }
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

// ─────────────────────────────────────────────
// Helper: translateTransactionType (logic cũ)
// ─────────────────────────────────────────────
function translateTransactionType(tx: string): string {
  const map: Record<string, string> = {
    payment: 'Đóng lãi',
    loan: 'Cho vay',
    additional_loan: 'Vay thêm',
    principal_repayment: 'Trả gốc',
    contract_close: 'Đóng HĐ',
    contract_reopen: 'Mở lại HĐ',
    debt_payment: 'Trả nợ',
    extension: 'Gia hạn',
    deposit: 'Nộp tiền',
    withdrawal: 'Rút tiền',
    income: 'Thu nhập',
    expense: 'Chi phí',
    penalty: 'Phạt',
    refund: 'Hoàn tiền',
    initial_loan: 'Khoản vay ban đầu',
    update_contract: 'Cập nhật HĐ',
    contract_delete: 'Xóa HĐ',
    contract_extension: 'Gia hạn HĐ',
    contract_rotate: 'Đảo HĐ',
    thu_khac: 'Thu khác', chi_khac: 'Chi khác',
    tra_luong: 'Trả lương', chi_tieu_dung: 'Chi tiêu dùng',
  };
  return map[tx] ?? tx;
}

// Prefix id so sánh trong script (khác id trong UI `processItems`)
const ID_PREFIX_CREDIT = 'tin-chap';
const ID_PREFIX_INSTALLMENT = 'tra-gop';
const ID_PREFIX_PAWN = 'cam-do';
const ID_PREFIX_STORE_FUND = 'nguon-von';

function storeFundComparableId(
  dateYmd: string,
  transactionType: string,
  customerName: string,
): string {
  return `${ID_PREFIX_STORE_FUND}-${dateYmd}-${transactionType}-${encodeURIComponent(customerName)}`;
}

function normalizeRpcDateOnly(v: string): string {
  if (!v) return v;
  return v.includes('T') ? v.slice(0, 10) : v;
}

// ─────────────────────────────────────────────
// LOGIC CŨ: credit_history → FundHistoryItem[]
// (tương đương processItems với source = 'Tín chấp')
// ─────────────────────────────────────────────
async function fetchOldCreditHistory(startDateISO: string, endDateISO: string) {
  const rawData = await fetchAllData(
    supabase
      .from('credit_history')
      .select(`
        id, created_at, updated_at, is_deleted, transaction_type,
        credit_amount, debit_amount, created_by,
        credits!inner(contract_code, store_id, customers(name)),
        profiles:created_by(username)
      `)
      .eq('credits.store_id', CONFIG.storeId)
      .or(
        `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}),` +
        `and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
      )
      .order('id'),
  );

  const items: OldFundHistoryItem[] = [];
  const pfx = ID_PREFIX_CREDIT;

  (rawData as OldRawRow[]).forEach((item) => {
    if (!item.created_at) return;
    const amount = Number(item.credit_amount ?? 0) - Number(item.debit_amount ?? 0);
    const contractCode = (item.credits as any)?.contract_code ?? '-';
    const customerName = (item.credits as any)?.customers?.name ?? '';
    const employeeName = (item.profiles as any)?.username ?? '';

    if (item.transaction_type === 'payment') {
      items.push({
        id: `${pfx}-${contractCode}-${item.created_at}`,
        date: item.created_at,
        description: 'Đóng lãi',
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode,
        employeeName,
        customerName,
      });

      if (item.is_deleted && item.updated_at) {
        items.push({
          id: `${pfx}-${contractCode}-${item.created_at}-cancel`,
          date: item.updated_at,
          description: 'Huỷ đóng lãi',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode,
          employeeName,
          customerName,
        });
      }
    } else {
      items.push({
        id: `${pfx}-${contractCode}-${item.created_at}`,
        date: item.created_at,
        description: translateTransactionType(item.transaction_type),
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode,
        employeeName,
        customerName,
      });
    }
  });

  return items;
}

// ─────────────────────────────────────────────
// LOGIC MỚI: RPC → FundHistoryItem[]
// ─────────────────────────────────────────────
async function fetchNewCreditHistory(startDateISO: string, endDateISO: string) {
  const { data, error } = await supabase.rpc('rpc_credit_history_grouped', {
    p_store_id:   CONFIG.storeId,
    p_start_date: startDateISO,
    p_end_date:   endDateISO,
  });

  if (error) {
    console.error('❌ RPC error:', error);
    return [];
  }

  const pfx = ID_PREFIX_CREDIT;

  return (data as NewCreditRow[]).map((row) => {
    const amount = Number(row.credit_amount) - Number(row.debit_amount);

    if (row.transaction_type === 'payment') {
      const items: OldFundHistoryItem[] = [
        {
          id: `${pfx}-${row.contract_code}-${row.transaction_date}`,
          date: `${row.transaction_date}T00:00:00`,
          description: 'Đóng lãi',
          income: amount > 0 ? amount : 0,
          expense: amount < 0 ? -amount : 0,
          contractCode: row.contract_code ?? '-',
          employeeName: row.employee_name ?? '',
          customerName: row.customer_name ?? '',
        },
      ];

      if (row.is_deleted && row.cancel_date) {
        items.push({
          id: `${pfx}-${row.contract_code}-${row.transaction_date}-cancel`,
          date: row.cancel_date,
          description: 'Huỷ đóng lãi',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode: row.contract_code ?? '-',
          employeeName: row.employee_name ?? '',
          customerName: row.customer_name ?? '',
        });
      }

      return items;
    }

    return [
      {
        id: `${pfx}-${row.contract_code}-${row.transaction_date}`,
        date: `${row.transaction_date}T00:00:00`,
        description: translateTransactionType(row.transaction_type),
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode: row.contract_code ?? '-',
        employeeName: row.employee_name ?? '',
        customerName: row.customer_name ?? '',
      },
    ];
  }).flat();
}

// ─────────────────────────────────────────────
// LOGIC CŨ: installment_history → FundHistoryItem[]
// (tương đương processItems với source = 'Trả góp'; filter giống useTransactionSummary.ts)
// ─────────────────────────────────────────────
async function fetchOldInstallmentHistory(startDateISO: string, endDateISO: string) {
  const rawData = await fetchAllData(
    supabase
      .from('installment_history')
      .select(`
        id, created_at, updated_at, is_deleted, transaction_type,
        credit_amount, debit_amount, created_by,
        installments!inner(
          contract_code,
          employee_id,
          employees!inner(store_id),
          customers(name)
        ),
        profiles:created_by(username)
      `)
      .eq('installments.employees.store_id', CONFIG.storeId)
      .or(
        `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}), and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
      )
      .not('transaction_type', 'in', '(contract_close,contract_rotate)')
      .order('id'),
  );

  const items: OldFundHistoryItem[] = [];
  const pfx = ID_PREFIX_INSTALLMENT;

  (rawData as OldInstallmentRawRow[]).forEach((item) => {
    if (!item.created_at) return;
    const amount = Number(item.credit_amount ?? 0) - Number(item.debit_amount ?? 0);
    const contractCode = (item.installments as any)?.contract_code ?? '-';
    const customerName = (item.installments as any)?.customers?.name ?? '';
    const employeeName = (item.profiles as any)?.username ?? '';

    if (item.transaction_type === 'payment') {
      items.push({
        id: `${pfx}-${contractCode}-${item.created_at}`,
        date: item.created_at,
        description: 'Đóng lãi',
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode,
        employeeName,
        customerName,
      });

      if (item.is_deleted && item.updated_at) {
        items.push({
          id: `${pfx}-${contractCode}-${item.created_at}-cancel`,
          date: item.updated_at,
          description: 'Huỷ đóng lãi',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode,
          employeeName,
          customerName,
        });
      }
    } else {
      items.push({
        id: `${pfx}-${contractCode}-${item.created_at}`,
        date: item.created_at,
        description: translateTransactionType(item.transaction_type),
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode,
        employeeName,
        customerName,
      });
    }
  });

  return items;
}

// ─────────────────────────────────────────────
// LOGIC MỚI: rpc_installment_history_grouped → FundHistoryItem[]
// ─────────────────────────────────────────────
async function fetchNewInstallmentHistory(startDateISO: string, endDateISO: string) {
  const { data, error } = await supabase.rpc('rpc_installment_history_grouped', {
    p_store_id:   CONFIG.storeId,
    p_start_date: startDateISO,
    p_end_date:   endDateISO,
  });

  if (error) {
    console.error('❌ RPC error (installment):', error);
    return [];
  }

  const pfx = ID_PREFIX_INSTALLMENT;

  return (data as NewCreditRow[]).map((row) => {
    const amount = Number(row.credit_amount) - Number(row.debit_amount);

    if (row.transaction_type === 'payment') {
      const items: OldFundHistoryItem[] = [
        {
          id: `${pfx}-${row.contract_code}-${row.transaction_date}`,
          date: `${row.transaction_date}T00:00:00`,
          description: 'Đóng lãi',
          income: amount > 0 ? amount : 0,
          expense: amount < 0 ? -amount : 0,
          contractCode: row.contract_code ?? '-',
          employeeName: row.employee_name ?? '',
          customerName: row.customer_name ?? '',
        },
      ];

      if (row.is_deleted && row.cancel_date) {
        items.push({
          id: `${pfx}-${row.contract_code}-${row.transaction_date}-cancel`,
          date: row.cancel_date,
          description: 'Huỷ đóng lãi',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode: row.contract_code ?? '-',
          employeeName: row.employee_name ?? '',
          customerName: row.customer_name ?? '',
        });
      }

      return items;
    }

    return [
      {
        id: `${pfx}-${row.contract_code}-${row.transaction_date}`,
        date: `${row.transaction_date}T00:00:00`,
        description: translateTransactionType(row.transaction_type),
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode: row.contract_code ?? '-',
        employeeName: row.employee_name ?? '',
        customerName: row.customer_name ?? '',
      },
    ];
  }).flat();
}

// ─────────────────────────────────────────────
// LOGIC CŨ: pawn_history → FundHistoryItem[]
// (tương đương processItems với source = 'Cầm đồ'; filter giống useTransactionSummary.ts)
// ─────────────────────────────────────────────
async function fetchOldPawnHistory(startDateISO: string, endDateISO: string) {
  const rawData = await fetchAllData(
    supabase
      .from('pawn_history')
      .select(`
        id, created_at, updated_at, is_deleted, transaction_type,
        credit_amount, debit_amount, created_by,
        pawns!inner(
          contract_code,
          store_id,
          customers(name),
          collateral_detail
        ),
        profiles:created_by(username)
      `)
      .eq('pawns.store_id', CONFIG.storeId)
      .or(
        `and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}),` +
        `and(transaction_type.eq.payment,is_deleted.eq.true,updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`
      )
      .order('id'),
  );

  const items: OldFundHistoryItem[] = [];
  const pfx = ID_PREFIX_PAWN;

  (rawData as OldPawnRawRow[]).forEach((item) => {
    if (!item.created_at) return;
    const amount = Number(item.credit_amount ?? 0) - Number(item.debit_amount ?? 0);
    const contractCode = (item.pawns as any)?.contract_code ?? '-';
    const customerName = (item.pawns as any)?.customers?.name ?? '';
    const employeeName = (item.profiles as any)?.username ?? '';

    if (item.transaction_type === 'payment') {
      items.push({
        id: `${pfx}-${contractCode}-${item.created_at}`,
        date: item.created_at,
        description: 'Đóng lãi',
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode,
        employeeName,
        customerName,
      });

      if (item.is_deleted && item.updated_at) {
        items.push({
          id: `${pfx}-${contractCode}-${item.created_at}-cancel`,
          date: item.updated_at,
          description: 'Huỷ đóng lãi',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode,
          employeeName,
          customerName,
        });
      }
    } else {
      items.push({
        id: `${pfx}-${contractCode}-${item.created_at}`,
        date: item.created_at,
        description: translateTransactionType(item.transaction_type),
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode,
        employeeName,
        customerName,
      });
    }
  });

  return items;
}

// ─────────────────────────────────────────────
// LOGIC MỚI: rpc_pawn_history_grouped → FundHistoryItem[]
// ─────────────────────────────────────────────
async function fetchNewPawnHistory(startDateISO: string, endDateISO: string) {
  const { data, error } = await supabase.rpc('rpc_pawn_history_grouped', {
    p_store_id:   CONFIG.storeId,
    p_start_date: startDateISO,
    p_end_date:   endDateISO,
  });

  if (error) {
    console.error('❌ RPC error (pawn):', error);
    return [];
  }

  const pfx = ID_PREFIX_PAWN;

  return (data as NewCreditRow[]).map((row) => {
    const amount = Number(row.credit_amount) - Number(row.debit_amount);

    if (row.transaction_type === 'payment') {
      const items: OldFundHistoryItem[] = [
        {
          id: `${pfx}-${row.contract_code}-${row.transaction_date}`,
          date: `${row.transaction_date}T00:00:00`,
          description: 'Đóng lãi',
          income: amount > 0 ? amount : 0,
          expense: amount < 0 ? -amount : 0,
          contractCode: row.contract_code ?? '-',
          employeeName: row.employee_name ?? '',
          customerName: row.customer_name ?? '',
        },
      ];

      if (row.is_deleted && row.cancel_date) {
        items.push({
          id: `${pfx}-${row.contract_code}-${row.transaction_date}-cancel`,
          date: row.cancel_date,
          description: 'Huỷ đóng lãi',
          income: amount < 0 ? -amount : 0,
          expense: amount > 0 ? amount : 0,
          contractCode: row.contract_code ?? '-',
          employeeName: row.employee_name ?? '',
          customerName: row.customer_name ?? '',
        });
      }

      return items;
    }

    return [
      {
        id: `${pfx}-${row.contract_code}-${row.transaction_date}`,
        date: `${row.transaction_date}T00:00:00`,
        description: translateTransactionType(row.transaction_type),
        income: amount > 0 ? amount : 0,
        expense: amount < 0 ? -amount : 0,
        contractCode: row.contract_code ?? '-',
        employeeName: row.employee_name ?? '',
        customerName: row.customer_name ?? '',
      },
    ];
  }).flat();
}

// ─────────────────────────────────────────────
// LOGIC CŨ: store_fund_history — gom nhóm như RPC (ngày + loại + name)
// Khớp processItems « Nguồn vốn »: withdrawal → chi, còn lại → thu theo fund_amount
// ─────────────────────────────────────────────
async function fetchOldStoreFundGrouped(startDateISO: string, endDateISO: string) {
  const rawData = await fetchAllData(
    supabase
      .from('store_fund_history')
      .select('id, created_at, transaction_type, fund_amount, name')
      .eq('store_id', CONFIG.storeId)
      .gte('created_at', startDateISO)
      .lte('created_at', endDateISO)
      .order('id'),
  );

  type Agg = { income: number; expense: number; txType: string; dateYmd: string; cust: string };
  const byId = new Map<string, Agg>();

  for (const item of rawData as OldStoreFundRawRow[]) {
    if (!item.created_at) continue;
    const rawAmt = Number(item.fund_amount ?? 0);
    const tx = item.transaction_type ?? '';
    const signed = tx === 'withdrawal' ? -rawAmt : rawAmt;
    const income = signed > 0 ? signed : 0;
    const expense = signed < 0 ? -signed : 0;
    const cust = item.name ?? '';
    const dateYmd = item.created_at.slice(0, 10);
    const id = storeFundComparableId(dateYmd, tx, cust);
    const cur = byId.get(id);
    if (cur) {
      cur.income += income;
      cur.expense += expense;
    } else {
      byId.set(id, { income, expense, txType: tx, dateYmd, cust });
    }
  }

  const items: OldFundHistoryItem[] = [];
  for (const [id, v] of byId) {
    items.push({
      id,
      date: `${v.dateYmd}T00:00:00`,
      description: translateTransactionType(v.txType),
      income: v.income,
      expense: v.expense,
      contractCode: '-',
      employeeName: '',
      customerName: v.cust,
    });
  }
  return items;
}

// ─────────────────────────────────────────────
// LOGIC MỚI: rpc_store_fund_history_grouped
// ─────────────────────────────────────────────
async function fetchNewStoreFundGrouped(startDateISO: string, endDateISO: string) {
  const { data, error } = await supabase.rpc('rpc_store_fund_history_grouped', {
    p_store_id:   CONFIG.storeId,
    p_start_date: startDateISO,
    p_end_date:   endDateISO,
  });

  if (error) {
    console.error('❌ RPC error (store_fund):', error);
    return [];
  }

  return (data as StoreFundGroupedRow[]).map((row) => {
    const dateStr = normalizeRpcDateOnly(String(row.transaction_date));
    const tx = row.transaction_type ?? '';
    const cust = row.customer_name ?? '';
    const raw = Number(row.fund_amount ?? 0);
    const signed = tx === 'withdrawal' ? -raw : raw;
    return {
      id: storeFundComparableId(dateStr, tx, cust),
      date: `${dateStr}T00:00:00`,
      description: translateTransactionType(tx),
      income: signed > 0 ? signed : 0,
      expense: signed < 0 ? -signed : 0,
      contractCode: '-',
      employeeName: '',
      customerName: cust,
    };
  });
}

// ─────────────────────────────────────────────
// Thu chi (transactions): RPC rpc_transactions_grouped ↔ fetch + transform (filter khớp WHERE của RPC)
// ─────────────────────────────────────────────

interface TransactionsGroupedRpcRow {
  transaction_date: string;
  transaction_type: string | null;
  is_deleted: boolean;
  cancel_date: string | null;
  credit_amount: number | string | null;
  debit_amount: number | string | null;
  raw_amount: number | string | null;
  customer_name: string | null;
  employee_name: string | null;
}

function expandTransactionsGroupedRpcToDisplayRows(rows: TransactionsGroupedRpcRow[]): any[] {
  const result: any[] = [];
  rows.forEach((r, i) => {
    const dateOnly = String(r.transaction_date).includes('T')
      ? String(r.transaction_date).slice(0, 10)
      : String(r.transaction_date);
    const baseCreated = `${dateOnly}T00:00:00`;
    const ca = Number(r.credit_amount ?? 0);
    const da = Number(r.debit_amount ?? 0);
    const cust = r.customer_name ?? '';
    const emp = r.employee_name ?? '';

    if (!r.is_deleted) {
      result.push({
        id: `transactions-rpc-${i}`,
        created_at: baseCreated,
        transaction_type: r.transaction_type,
        credit_amount: ca,
        debit_amount: da,
        employee_name: emp,
        customers: { name: cust },
        is_deleted: false,
      });
      return;
    }

    const cancelTs = r.cancel_date ?? baseCreated;
    result.push({
      id: `transactions-rpc-${i}`,
      created_at: baseCreated,
      update_at: cancelTs,
      transaction_type: r.transaction_type,
      credit_amount: ca,
      debit_amount: da,
      employee_name: emp,
      customers: { name: cust },
      is_deleted: true,
    });
    result.push({
      id: `transactions-rpc-${i}_cancel`,
      created_at: cancelTs,
      transaction_type: r.transaction_type,
      credit_amount: ca ? -ca : null,
      debit_amount: da ? -da : null,
      employee_name: emp,
      customers: { name: cust },
      is_deleted: true,
      is_cancellation: true,
    });
  });
  return result;
}

function transformTransactionsForDisplay(rawTransactions: any[]): any[] {
  const displayTransactions: any[] = [];
  rawTransactions.forEach((transaction) => {
    if (transaction.is_deleted) {
      displayTransactions.push({
        ...transaction,
        is_cancellation: false,
      });
      displayTransactions.push({
        ...transaction,
        id: `${transaction.id}_cancel`,
        is_cancellation: true,
        created_at: transaction.update_at || transaction.created_at,
        credit_amount: transaction.credit_amount ? -transaction.credit_amount : null,
        debit_amount: transaction.debit_amount ? -transaction.debit_amount : null,
        description: transaction.credit_amount > 0 ? 'Huỷ thu' : 'Huỷ chi',
      });
    } else {
      displayTransactions.push({
        ...transaction,
        is_cancellation: false,
      });
    }
  });
  return displayTransactions;
}

function mapThuChiRowToComparable(item: any): OldFundHistoryItem {
  let amount = (Number(item.credit_amount) || 0) - (Number(item.debit_amount) || 0);
  if (amount === 0) {
    amount =
      item.transaction_type === 'expense'
        ? -Number(item.amount ?? 0)
        : Number(item.amount ?? 0);
  }
  return {
    id: `thu chi-${item.id}`,
    date: item.created_at,
    description: translateTransactionType(item.transaction_type || ''),
    income: amount > 0 ? amount : 0,
    expense: amount < 0 ? -amount : 0,
    contractCode: '-',
    employeeName: item.employee_name || '',
    customerName: item.customers?.name || '',
  };
}

async function fetchOldThuChiComparable(startDateISO: string, endDateISO: string) {
  const rawData = await fetchAllData(
    supabase
      .from('transactions')
      .select('*, customers:customer_id(name)')
      .eq('store_id', CONFIG.storeId)
      .or(
        `and(is_deleted.eq.false,and(created_at.gte.${startDateISO},created_at.lte.${endDateISO})),` +
        `and(is_deleted.eq.true,and(update_at.gte.${startDateISO},update_at.lte.${endDateISO}))`
      )
      .order('id'),
  );

  const expanded = transformTransactionsForDisplay(rawData as any[]);
  return expanded.map(mapThuChiRowToComparable);
}

async function fetchNewThuChiComparable(startDateISO: string, endDateISO: string) {
  const { data, error } = await supabase.rpc('rpc_transactions_grouped', {
    p_store_id:   CONFIG.storeId,
    p_start_date: startDateISO,
    p_end_date:   endDateISO,
  });

  if (error) {
    console.error('❌ RPC error (transactions):', error);
    return [];
  }

  const expanded = expandTransactionsGroupedRpcToDisplayRows((data || []) as TransactionsGroupedRpcRow[]);
  return expanded.map(mapThuChiRowToComparable);
}

// ─────────────────────────────────────────────
// So sánh 2 mảng
// ─────────────────────────────────────────────
interface OldFundHistoryItem {
  id: string; date: string; description: string;
  income: number; expense: number;
  contractCode: string; employeeName: string; customerName: string;
}

interface OldRawRow {
  id: string; created_at: string; updated_at: string | null;
  is_deleted: boolean; transaction_type: string;
  credit_amount: number | null; debit_amount: number | null;
  created_by: string | null;
  credits: { contract_code: string; store_id: string; customers: { name: string } } | null;
  profiles: { username: string } | null;
}

interface OldInstallmentRawRow {
  id: string; created_at: string; updated_at: string | null;
  is_deleted: boolean; transaction_type: string;
  credit_amount: number | null; debit_amount: number | null;
  created_by: string | null;
  installments: {
    contract_code: string;
    employee_id: string;
    employees: { store_id: string };
    customers: { name: string } | null;
  } | null;
  profiles: { username: string } | null;
}

interface OldPawnRawRow {
  id: string; created_at: string; updated_at: string | null;
  is_deleted: boolean; transaction_type: string;
  credit_amount: number | null; debit_amount: number | null;
  created_by: string | null;
  pawns: {
    contract_code: string;
    store_id: string;
    customers: { name: string } | null;
    collateral_detail: unknown;
  } | null;
  profiles: { username: string } | null;
}

interface OldStoreFundRawRow {
  id: string;
  created_at: string;
  transaction_type: string | null;
  fund_amount: number | string | null;
  name: string | null;
}

interface StoreFundGroupedRow {
  transaction_date: string;
  transaction_type: string;
  fund_amount: number;
  customer_name: string;
}

interface NewCreditRow {
  contract_code: string;
  transaction_date: string;
  transaction_type: string;
  is_deleted: boolean;
  credit_amount: number;
  debit_amount: number;
  cancel_date: string | null;
  customer_name: string;
  employee_name: string;
}

function compare(
  oldItems: OldFundHistoryItem[],
  newItems: OldFundHistoryItem[],
): { passed: boolean; missing: OldFundHistoryItem[]; extra: OldFundHistoryItem[]; diff: string[] } {
  const diff: string[] = [];
  const oldMap = new Map(oldItems.map((i) => [i.id, i]));
  const newMap = new Map(newItems.map((i) => [i.id, i]));

  const missing: OldFundHistoryItem[] = [];
  const extra: OldFundHistoryItem[] = [];

  for (const [id, oldItem] of oldMap) {
    const newItem = newMap.get(id);
    if (!newItem) {
      missing.push(oldItem);
    } else {
      const fields = ['income', 'expense', 'description', 'contractCode', 'employeeName', 'customerName'] as const;
      for (const f of fields) {
        if (String(oldItem[f]) !== String(newItem[f])) {
          diff.push(`✗ ID="${id}" field="${f}": OLD=${JSON.stringify(oldItem[f])} NEW=${JSON.stringify(newItem[f])}`);
        }
      }
    }
  }

  for (const [id, newItem] of newMap) {
    if (!oldMap.has(id)) {
      extra.push(newItem);
    }
  }

  return { passed: diff.length === 0 && missing.length === 0 && extra.length === 0, missing, extra, diff };
}

async function runParityTest(
  title: string,
  fetchOld: (start: string, end: string) => Promise<OldFundHistoryItem[]>,
  fetchNew: (start: string, end: string) => Promise<OldFundHistoryItem[]>,
  startDateISO: string,
  endDateISO: string,
  labelDates?: { start: string; end: string },
) {
  const ds = labelDates ?? { start: CONFIG.startDate, end: CONFIG.endDate };
  console.log('═══════════════════════════════════════');
  console.log(`  Test: ${title}`);
  console.log(`  Store: ${CONFIG.storeId}`);
  console.log(`  Date:  ${ds.start} → ${ds.end}`);
  console.log(`  TEST_RPC_TARGET: ${CONFIG.testRpcTarget}`);
  console.log('═══════════════════════════════════════\n');

  if (!CONFIG.compareWithOldLogic) {
    console.log('🔍 Chế độ: Chỉ chạy RPC (không so sánh)\n');
    const newItems = await fetchNew(startDateISO, endDateISO);
    console.log(`✅ RPC trả về ${newItems.length} rows:\n`);
    newItems.slice(0, 20).forEach((item) => {
      console.log(
        `  [${item.id}] date=${item.date} desc="${item.description}" ` +
        `income=${item.income} expense=${item.expense} ` +
        `contract=${item.contractCode} emp="${item.employeeName}" cust="${item.customerName}"`
      );
    });
    if (newItems.length > 20) console.log(`  ... và ${newItems.length - 20} rows nữa`);
    return;
  }

  console.log('🔄 Đang chạy logic cũ (fetchAllData)...');
  const oldItems = await fetchOld(startDateISO, endDateISO);
  console.log(`   ✓ Logic cũ: ${oldItems.length} rows\n`);

  console.log('🔄 Đang chạy RPC mới...');
  const newItems = await fetchNew(startDateISO, endDateISO);
  console.log(`   ✓ RPC mới:  ${newItems.length} rows\n`);

  const result = compare(oldItems, newItems);

  if (result.passed) {
    console.log('✅ KẾT QUẢ: GIỐNG NHAU — RPC hoạt động chính xác!\n');
  } else {
    console.log('❌ KẾT QUẢ: KHÁC NHAU\n');
    if (result.missing.length > 0) {
      console.log(`🔸 Missing (có trong logic cũ, thiếu trong RPC): ${result.missing.length} rows`);
      result.missing.slice(0, 5).forEach((i) => console.log(`  - ${i.id} | ${i.description}`));
      if (result.missing.length > 5) console.log(`  ... và ${result.missing.length - 5} rows nữa`);
    }
    if (result.extra.length > 0) {
      console.log(`🔸 Extra (có trong RPC, không có trong logic cũ): ${result.extra.length} rows`);
      result.extra.slice(0, 5).forEach((i) => console.log(`  - ${i.id} | ${i.description}`));
      if (result.extra.length > 5) console.log(`  ... và ${result.extra.length - 5} rows nữa`);
    }
    if (result.diff.length > 0) {
      console.log(`🔸 Diff (cùng ID nhưng giá trị khác): ${result.diff.length} rows`);
      result.diff.slice(0, 10).forEach((d) => console.log(`  ${d}`));
      if (result.diff.length > 10) console.log(`  ... và ${result.diff.length - 10} diff nữa`);
    }
  }

  console.log('\n📋 Sample 10 rows từ RPC:');
  newItems.slice(0, 10).forEach((item) => {
    console.log(
      `  ${item.id} | ${item.date} | "${item.description}" | ` +
      `income=${item.income} expense=${item.expense} | ` +
      `${item.contractCode} | "${item.employeeName}" | "${item.customerName}"`
    );
  });

  console.log('\n📋 Sample 10 rows từ logic cũ:');
  oldItems.slice(0, 10).forEach((item) => {
    console.log(
      `  ${item.id} | ${item.date} | "${item.description}" | ` +
      `income=${item.income} expense=${item.expense} | ` +
      `${item.contractCode} | "${item.employeeName}" | "${item.customerName}"`
    );
  });
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  const t = CONFIG.testRpcTarget;
  let effStart = CONFIG.startDate;
  let effEnd = CONFIG.endDate;
  if (
    t === 'transactions' &&
    process.env.TEST_START_DATE === undefined &&
    process.env.TEST_END_DATE === undefined
  ) {
    effStart = '2025-08-01';
    effEnd = '2025-08-31';
  }
  const { startDateISO, endDateISO } = getDateRange(effStart, effEnd);
  const labelDates = { start: effStart, end: effEnd };

  if (t === 'credit' || t === 'all') {
    await runParityTest(
      'credit_history ↔ rpc_credit_history_grouped',
      fetchOldCreditHistory,
      fetchNewCreditHistory,
      startDateISO,
      endDateISO,
      labelDates,
    );
    if (t === 'all') console.log('\n\n');
  }

  if (t === 'installment' || t === 'all') {
    await runParityTest(
      'installment_history ↔ rpc_installment_history_grouped',
      fetchOldInstallmentHistory,
      fetchNewInstallmentHistory,
      startDateISO,
      endDateISO,
      labelDates,
    );
    if (t === 'all') console.log('\n\n');
  }

  if (t === 'pawn' || t === 'all') {
    await runParityTest(
      'pawn_history ↔ rpc_pawn_history_grouped',
      fetchOldPawnHistory,
      fetchNewPawnHistory,
      startDateISO,
      endDateISO,
      labelDates,
    );
    if (t === 'all') console.log('\n\n');
  }

  if (t === 'fund' || t === 'all') {
    await runParityTest(
      'store_fund_history (grouped) ↔ rpc_store_fund_history_grouped',
      fetchOldStoreFundGrouped,
      fetchNewStoreFundGrouped,
      startDateISO,
      endDateISO,
      labelDates,
    );
    if (t === 'all') console.log('\n\n');
  }

  if (t === 'transactions' || t === 'all') {
    await runParityTest(
      'transactions ↔ rpc_transactions_grouped',
      fetchOldThuChiComparable,
      fetchNewThuChiComparable,
      startDateISO,
      endDateISO,
      labelDates,
    );
  }
}

main().catch(console.error);
