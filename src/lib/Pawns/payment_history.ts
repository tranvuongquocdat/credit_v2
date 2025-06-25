import { supabase } from "../supabase";

// Interface cho payment history record
export interface PaymentHistoryRecord {
  id: string;
  pawn_id: string;
  transaction_type: string;
  effective_date: string | null;
  date_status: string | null;
  credit_amount: number | null;
  debit_amount: number | null;
  description: string | null;
  period_number?: number | null;
  created_at: string;
  updated_at?: string | null;
  is_deleted?: boolean;
}

/**
 * Lấy lịch sử thanh toán lãi phí của một hợp đồng pawn
 * @param pawnId - ID của hợp đồng pawn
 * @param includeDeleted - Có lấy các records đã bị đánh dấu xóa không (default: false)
 * @returns Promise<PaymentHistoryRecord[]> - Danh sách lịch sử thanh toán
 */
export async function getPawnPaymentHistory(
  pawnId: string, 
  includeDeleted: boolean = false
): Promise<PaymentHistoryRecord[]> {
  let query = supabase
    .from('pawn_history')
    .select('*')
    .eq('pawn_id', pawnId)
    .eq('transaction_type', 'payment');

  // Filter out deleted records by default
  if (!includeDeleted) {
    query = query.eq('is_deleted', false);
  }
  const { data, error } = await query.order('effective_date', { ascending: true });
  if (error) {
    console.error('Error fetching payment history:', error);
    throw new Error(`Failed to fetch payment history: ${error.message}`);
  }

  return data || [];
}