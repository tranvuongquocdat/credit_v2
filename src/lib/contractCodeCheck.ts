import { supabase } from './supabase';

type ContractSource = 'credits' | 'pawns' | 'installments';

/**
 * Kiểm tra mã HĐ có bị trùng với 1 HĐ khác (chưa xoá) trong cùng cửa hàng không.
 * Dùng để cảnh báo (không chặn cứng — DB không có UNIQUE constraint).
 *
 * - credits / pawns: query thẳng bảng (có cột store_id, status enum 'deleted').
 * - installments: bảng KHÔNG có store_id → dùng view installments_by_store
 *   (store_id + status_code 'DELETED').
 */
export async function checkDuplicateContractCode(params: {
  source: ContractSource;
  storeId: string;
  contractCode: string;
  excludeId?: string;
}): Promise<{ isDuplicate: boolean; customerName: string | null }> {
  const code = (params.contractCode || '').trim();
  if (!code || !params.storeId) return { isDuplicate: false, customerName: null };

  const isInstallment = params.source === 'installments';
  const from = isInstallment ? 'installments_by_store' : params.source;

  let query = (supabase as any)
    .from(from)
    .select('id, customer_id')
    .eq('store_id', params.storeId)
    .eq('contract_code', code)
    .limit(1);

  query = isInstallment
    ? query.neq('status_code', 'DELETED')
    : query.neq('status', 'deleted');

  if (params.excludeId) query = query.neq('id', params.excludeId);

  const { data } = await query;
  if (!data || data.length === 0) return { isDuplicate: false, customerName: null };

  let customerName: string | null = null;
  const cid = data[0].customer_id;
  if (cid) {
    const { data: cust } = await (supabase as any)
      .from('customers')
      .select('name')
      .eq('id', cid)
      .single();
    customerName = cust?.name ?? null;
  }
  return { isDuplicate: true, customerName };
}

/**
 * Hiện confirm nếu trùng mã. Trả về true = tiếp tục lưu, false = huỷ (user chọn không lưu).
 */
export async function confirmIfDuplicateContractCode(params: {
  source: ContractSource;
  storeId: string;
  contractCode: string;
  excludeId?: string;
}): Promise<boolean> {
  const { isDuplicate, customerName } = await checkDuplicateContractCode(params);
  if (!isDuplicate) return true;
  const who = customerName ? ` (KH: ${customerName})` : '';
  return window.confirm(
    `Mã HĐ "${params.contractCode.trim()}" đã tồn tại ở 1 HĐ khác${who}.\n` +
    `Trùng mã sẽ làm khó tra cứu trên URL/tìm kiếm. Vẫn lưu?`
  );
}
