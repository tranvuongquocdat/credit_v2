type HistoryItem = {
  id: string;
  pawn_id?: string | null;
  created_at: string | null;
  transaction_type?: string | null;
  credit_amount?: number | null;
  debit_amount?: number | null;
  description?: string | null;
  [key: string]: any;
};

const formatVND = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount);

/**
 * Gộp row `contract_close_adjustment` (Tiền tùy chỉnh) vào row `contract_close` cùng pawn_id + cùng ngày
 * để hiển thị 1 dòng duy nhất ở báo cáo quỹ. Giữ nguyên DB, chỉ xử lý lúc render.
 *
 * - Cộng credit/debit của adjustment vào close.
 * - Chèn note "điều chỉnh: ±X" vào cuối description (trước dấu `)` cuối) hoặc nối vào đuôi nếu không có ngoặc.
 * - Drop row adjustment.
 * - Row adjustment mồ côi (không có close cùng ngày — edge case) giữ nguyên.
 */
export function mergePawnCloseAdjustment<T extends HistoryItem>(items: T[]): T[] {
  const keyOf = (it: T) => `${it.pawn_id ?? ''}|${(it.created_at ?? '').slice(0, 10)}`;

  const adjByKey = new Map<string, T>();
  items.forEach(it => {
    if (it.transaction_type === 'contract_close_adjustment') {
      adjByKey.set(keyOf(it), it);
    }
  });

  const result: T[] = [];
  items.forEach(it => {
    if (it.transaction_type === 'contract_close_adjustment') return;

    if (it.transaction_type === 'contract_close') {
      const adj = adjByKey.get(keyOf(it));
      if (adj) {
        const adjNet = (adj.credit_amount || 0) - (adj.debit_amount || 0);
        const sign = adjNet >= 0 ? '+' : '-';
        const adjStr = `${sign}${formatVND(Math.abs(adjNet))}`;
        const note = adj.description ? ` - ${adj.description}` : '';
        const piece = ` + điều chỉnh: ${adjStr}${note}`;

        const baseDesc = it.description || '';
        const newDesc = baseDesc.endsWith(')')
          ? baseDesc.replace(/\)$/, `${piece})`)
          : `${baseDesc}${piece}`;

        adjByKey.delete(keyOf(it));
        result.push({
          ...it,
          credit_amount: (it.credit_amount || 0) + (adj.credit_amount || 0),
          debit_amount: (it.debit_amount || 0) + (adj.debit_amount || 0),
          description: newDesc,
        });
        return;
      }
    }

    result.push(it);
  });

  adjByKey.forEach(orphan => result.push(orphan));
  return result;
}
