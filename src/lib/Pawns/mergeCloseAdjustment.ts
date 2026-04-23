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
 * Gộp row `contract_close_adjustment` (Tiền tùy chỉnh) vào row `contract_close`
 * tương ứng để hiển thị 1 dòng duy nhất ở báo cáo quỹ. Giữ nguyên DB, chỉ xử lý lúc render.
 *
 * Pairing: mỗi adjustment được merge vào close cùng pawn_id có `created_at` gần
 * nhất trước hoặc bằng thời điểm của adjustment (vì adjustment luôn được ghi
 * ngay sau close trong cùng `handleRedeemPawn`). Cách này xử lý đúng cả case
 * close → reopen → close lại trong cùng ngày (mỗi adjustment đi đúng với close
 * của cycle tương ứng theo timestamp, không bị gộp nhầm vào close của cycle cũ).
 */
export function mergePawnCloseAdjustment<T extends HistoryItem>(items: T[]): T[] {
  // Group close rows by pawn_id, giữ thứ tự tăng dần theo created_at.
  const closesByPawn = new Map<string, T[]>();
  items.forEach(it => {
    if (it.transaction_type !== 'contract_close') return;
    const pid = it.pawn_id ?? '';
    if (!closesByPawn.has(pid)) closesByPawn.set(pid, []);
    closesByPawn.get(pid)!.push(it);
  });
  closesByPawn.forEach(arr =>
    arr.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  );

  // Với mỗi adjustment, chọn close cùng pawn_id có created_at gần nhất và <= adjustment.created_at.
  // Nếu không có close nào trước đó (edge case dữ liệu lệch), lấy close sớm nhất.
  const adjByCloseId = new Map<string, T>(); // closeId -> adjustment đã gán
  items.forEach(it => {
    if (it.transaction_type !== 'contract_close_adjustment') return;
    const pid = it.pawn_id ?? '';
    const closes = closesByPawn.get(pid);
    if (!closes || closes.length === 0) return;
    const adjTime = it.created_at ?? '';
    let matched: T | undefined;
    for (let i = closes.length - 1; i >= 0; i--) {
      if ((closes[i].created_at ?? '') <= adjTime) {
        matched = closes[i];
        break;
      }
    }
    if (!matched) matched = closes[0];
    // Nếu close đó đã được gán adjustment khác (hiếm, vì tối đa 1 adj alive / cycle),
    // giữ adjustment có created_at mới hơn để khớp pair gần nhất.
    const existing = adjByCloseId.get(matched.id);
    if (!existing || (existing.created_at ?? '') < adjTime) {
      adjByCloseId.set(matched.id, it);
    }
  });

  // Tập các adjustment đã được merge (để bỏ qua khi duyệt lại).
  const mergedAdjIds = new Set<string>();
  adjByCloseId.forEach(adj => mergedAdjIds.add(adj.id));

  const result: T[] = [];
  items.forEach(it => {
    if (it.transaction_type === 'contract_close_adjustment') {
      // Adjustment mồ côi (không pair được với close nào) → giữ lại hiển thị nguyên dòng.
      if (!mergedAdjIds.has(it.id)) result.push(it);
      return;
    }

    if (it.transaction_type === 'contract_close') {
      const adj = adjByCloseId.get(it.id);
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

  return result;
}
