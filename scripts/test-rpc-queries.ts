/**
 * Test script: So sánh kết quả RPC query với fetchAllData logic hiện tại
 *
 * Chạy:
 *   npx tsx scripts/test-rpc-queries.ts
 *   TEST_RPC_TARGET=installment npx tsx scripts/test-rpc-queries.ts
 *   TEST_RPC_TARGET=all npx tsx scripts/test-rpc-queries.ts
 *
 * Hoặc: npx tsx scripts/test-rpc-installment-queries.ts (chỉ trả góp)
 *
 * Biến môi trường: `.env.local` (NEXT_PUBLIC_SUPABASE_URL, key, TEST_STORE_ID, …)
 *
 * TEST_RPC_TARGET: `credit` (mặc định) | `installment` | `all`
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
const testRpcTarget: 'credit' | 'installment' | 'all' =
  rawTarget === 'installment' ? 'installment' : rawTarget === 'all' ? 'all' : 'credit';

const CONFIG = {
  supabaseUrl:   process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey:   process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  storeId:       process.env.TEST_STORE_ID ?? '729a9ee8-e0b5-436f-8a59-706395b11646',
  startDate:     process.env.TEST_START_DATE ?? '2026-04-15',  // yyyy-MM-dd
  endDate:       process.env.TEST_END_DATE   ?? '2026-04-15',  // yyyy-MM-dd
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
) {
  console.log('═══════════════════════════════════════');
  console.log(`  Test: ${title}`);
  console.log(`  Store: ${CONFIG.storeId}`);
  console.log(`  Date:  ${CONFIG.startDate} → ${CONFIG.endDate}`);
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
  const { startDateISO, endDateISO } = getDateRange(CONFIG.startDate, CONFIG.endDate);
  const t = CONFIG.testRpcTarget;

  if (t === 'credit' || t === 'all') {
    await runParityTest(
      'credit_history ↔ rpc_credit_history_grouped',
      fetchOldCreditHistory,
      fetchNewCreditHistory,
      startDateISO,
      endDateISO,
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
    );
  }
}

main().catch(console.error);
