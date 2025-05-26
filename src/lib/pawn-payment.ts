import { supabase } from './supabase';
import { 
  PawnPaymentPeriod, 
  CreatePawnPaymentPeriodData, 
  UpdatePawnPaymentPeriodData,
  BulkCreatePawnPaymentPeriodsData,
  CustomPawnPaymentPeriodData
} from '@/models/pawn-payment';
import { PawnStatus } from '@/models/pawn';

/**
 * Lấy danh sách kỳ thanh toán của một hợp đồng cầm đồ
 */
export async function getPawnPaymentPeriods(pawnId: string) {
  try {
    const { data, error } = await supabase
      .from('pawn_payment_periods')
      .select('*')
      .eq('pawn_id', pawnId)
      .order('period_number', { ascending: true });
    
    if (error) throw error;
    
    return { data: data as PawnPaymentPeriod[], error: null };
  } catch (error) {
    console.error('Error fetching pawn payment periods:', error);
    return { data: null, error };
  }
}

/**
 * Tạo một kỳ thanh toán mới
 */
export async function createPawnPaymentPeriod(data: CreatePawnPaymentPeriodData) {
  try {
    const { data: result, error } = await supabase
      .from('pawn_payment_periods')
      .insert({
        pawn_id: data.pawn_id,
        period_number: data.period_number,
        start_date: data.start_date,
        end_date: data.end_date,
        expected_amount: data.expected_amount,
        actual_amount: 0,
        notes: data.notes || null
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: result as PawnPaymentPeriod, error: null };
  } catch (error) {
    console.error('Error creating pawn payment period:', error);
    return { data: null, error };
  }
}

/**
 * Tạo nhiều kỳ thanh toán cùng lúc
 */
export async function bulkCreatePawnPaymentPeriods(data: BulkCreatePawnPaymentPeriodsData) {
  try {
    const periodsToInsert = data.periods.map(period => ({
      pawn_id: data.pawn_id,
      period_number: period.period_number,
      start_date: period.start_date,
      end_date: period.end_date,
      expected_amount: period.expected_amount,
      actual_amount: 0,
      notes: period.notes || null
    }));
    
    const { data: result, error } = await supabase
      .from('pawn_payment_periods')
      .insert(periodsToInsert)
      .select();
    
    if (error) throw error;
    
    return { data: result as PawnPaymentPeriod[], error: null };
  } catch (error) {
    console.error('Error bulk creating pawn payment periods:', error);
    return { data: null, error };
  }
}

/**
 * Cập nhật thông tin kỳ thanh toán
 */
export async function updatePawnPaymentPeriod(
  id: string,
  data: UpdatePawnPaymentPeriodData
) {
  try {
    const { data: result, error } = await supabase
      .from('pawn_payment_periods')
      .update({
        actual_amount: data.actual_amount,
        payment_date: data.payment_date,
        notes: data.notes,
        other_amount: data.other_amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: result as PawnPaymentPeriod, error: null };
  } catch (error) {
    console.error('Error updating pawn payment period:', error);
    return { data: null, error };
  }
}

/**
 * Xóa một kỳ thanh toán
 */
export async function deletePawnPaymentPeriod(id: string, pawnId?: string) {
  try {
    let query = supabase
      .from('pawn_payment_periods')
      .delete();
    
    if (pawnId) {
      // Nếu có pawnId thì thêm điều kiện để tối ưu query
      query = query.eq('pawn_id', pawnId);
    }
    
    const { data, error } = await query.eq('id', id).select();
    
    if (error) throw error;
    
    return { data: data as PawnPaymentPeriod[], error: null };
  } catch (error) {
    console.error('Error deleting pawn payment period:', error);
    return { data: null, error };
  }
}

/**
 * Tạo kỳ thanh toán tùy chỉnh
 */
export async function createCustomPawnPaymentPeriod(data: CustomPawnPaymentPeriodData) {
  try {
    // Lấy kỳ cuối cùng để tính kỳ tiếp theo
    const { data: lastPeriod, error: fetchError } = await supabase
      .from('pawn_payment_periods')
      .select('period_number')
      .eq('pawn_id', data.pawn_id)
      .order('period_number', { ascending: false })
      .limit(1)
      .single();
    
    // Nếu không tìm thấy kỳ nào hoặc có lỗi, bắt đầu từ kỳ 1
    const nextPeriodNumber = fetchError ? 1 : (lastPeriod?.period_number || 0) + 1;
    
    // Tạo kỳ mới
    const { data: result, error } = await supabase
      .from('pawn_payment_periods')
      .insert({
        pawn_id: data.pawn_id,
        period_number: nextPeriodNumber,
        start_date: data.start_date,
        end_date: data.end_date,
        expected_amount: data.expected_amount,
        actual_amount: 0,
        notes: data.notes || null
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: result as PawnPaymentPeriod, error: null };
  } catch (error) {
    console.error('Error creating custom pawn payment period:', error);
    return { data: null, error };
  }
}

/**
 * Cập nhật trạng thái của hợp đồng cầm đồ
 */
export async function updatePawnStatus(pawnId: string, status: PawnStatus) {
  try {
    const { data, error } = await supabase
      .from('pawns')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', pawnId)
      .select();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error updating pawn status:', error);
    return { data: null, error };
  }
}

/**
 * Lưu thông tin thanh toán cho một kỳ
 */
export async function savePawnPayment(
  pawnId: string,
  paymentPeriod: PawnPaymentPeriod,
  actualAmount: number,
  isCalculatedPeriod: boolean
) {
  try {
    // Nếu là kỳ được tính toán (chưa có trong DB), tạo mới
    if (isCalculatedPeriod) {
      const { data, error } = await supabase
        .from('pawn_payment_periods')
        .insert({
          pawn_id: pawnId,
          period_number: paymentPeriod.period_number,
          start_date: paymentPeriod.start_date,
          end_date: paymentPeriod.end_date,
          expected_amount: paymentPeriod.expected_amount,
          actual_amount: actualAmount,
          payment_date: new Date().toISOString(),
          notes: paymentPeriod.notes || null
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return { data, error: null };
    }
    
    // Nếu là kỳ đã có, cập nhật thông tin
    const { data, error } = await supabase
      .from('pawn_payment_periods')
      .update({
        actual_amount: actualAmount,
        payment_date: actualAmount > 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentPeriod.id)
      .select()
      .single();
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error saving pawn payment:', error);
    return { data: null, error };
  }
}

/**
 * Lưu nhiều kỳ thanh toán cùng lúc
 */
export async function bulkSavePawnPayments(
  pawnId: string,
  paymentPeriods: PawnPaymentPeriod[]
) {
  try {
    const updates = [];
    const inserts = [];
    
    // Phân loại kỳ cần thêm mới và kỳ cần cập nhật
    for (const period of paymentPeriods) {
      if (period.id.startsWith('calculated-')) {
        // Kỳ được tính toán, thêm mới
        inserts.push({
          pawn_id: pawnId,
          period_number: period.period_number,
          start_date: period.start_date,
          end_date: period.end_date,
          expected_amount: period.expected_amount,
          actual_amount: period.actual_amount || period.expected_amount,
          payment_date: new Date().toISOString(),
          notes: period.notes || null
        });
      } else {
        // Kỳ đã có, cập nhật
        updates.push({
          id: period.id,
          actual_amount: period.actual_amount || period.expected_amount,
          payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }
    
    // Thực hiện các thao tác
    const results: { 
      inserts: PawnPaymentPeriod[] | null; 
      updates: typeof updates | null; 
    } = { inserts: null, updates: null };
    
    if (inserts.length > 0) {
      const { data, error } = await supabase
        .from('pawn_payment_periods')
        .insert(inserts)
        .select();
      
      if (error) throw error;
      results.inserts = data as PawnPaymentPeriod[];
    }
    
    if (updates.length > 0) {
      // Supabase không hỗ trợ UPSERT với mảng có ids khác nhau,
      // nên phải cập nhật từng record
      for (const update of updates) {
        const { error } = await supabase
          .from('pawn_payment_periods')
          .update({
            actual_amount: update.actual_amount,
            payment_date: update.payment_date,
            updated_at: update.updated_at
          })
          .eq('id', update.id);
        
        if (error) throw error;
      }
      results.updates = updates;
    }
    
    return { data: results, error: null };
  } catch (error) {
    console.error('Error bulk saving pawn payments:', error);
    return { data: null, error };
  }
}

/**
 * Lưu thông tin thanh toán với số tiền khác cho một kỳ
 */
export async function savePaymentWithOtherAmount(
  periodId: string,
  actualAmount: number,
  otherAmount?: number,
  notes?: string
) {
  try {
    const { data, error } = await supabase
      .from('pawn_payment_periods')
      .update({
        actual_amount: actualAmount,
        other_amount: otherAmount || null,
        payment_date: new Date().toISOString(),
        notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', periodId)
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: data as PawnPaymentPeriod, error: null };
  } catch (error) {
    console.error('Error saving payment with other amount:', error);
    return { data: null, error };
  }
}

/**
 * Tạo và lưu kỳ thanh toán tùy chỉnh với số tiền khác (Credit-style)
 */
export async function saveCustomPaymentWithOtherAmount(
  pawnId: string,
  periodData: {
    period_number: number;
    start_date: string;
    end_date: string;
    expected_amount: number;
    other_amount: number;
    actual_amount: number;
  },
  interestAmount: number,
  otherAmount: number,
  isCalculatedPeriod: boolean
) {
  try {
    // Tạo kỳ thanh toán mới
    const { data, error } = await supabase
      .from('pawn_payment_periods')
      .insert({
        pawn_id: pawnId,
        period_number: periodData.period_number,
        start_date: periodData.start_date,
        end_date: periodData.end_date,
        expected_amount: periodData.expected_amount,
        other_amount: periodData.other_amount,
        actual_amount: periodData.actual_amount,
        payment_date: new Date().toISOString(),
        notes: `Kỳ tùy chỉnh - Lãi: ${interestAmount}, Khác: ${otherAmount}`
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return { data: data as PawnPaymentPeriod, error: null };
  } catch (error) {
    console.error('Error saving custom payment with other amount:', error);
    return { data: null, error };
  }
} 