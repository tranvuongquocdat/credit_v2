import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PawnStatusResult } from '@/lib/Pawns/calculate_pawn_status';

interface RpcStatusRow {
  pawn_id: string;
  status_code: PawnStatusResult['statusCode'];
}

/**
 * Hook lấy trạng thái hợp đồng tín chấp (chỉ những hợp đồng đưa vào).
 * Sử dụng PostgreSQL function `get_credit_statuses` để giảm round-trip.
 */
export function usePawnStatuses(pawnIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, PawnStatusResult>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pawnIds || pawnIds.length === 0) {
      setStatuses({});
      return;
    }

    let isCancelled = false;

    const fetchStatuses = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_pawn_statuses', {
          p_pawn_ids: pawnIds,
        });

        if (error) {
          console.error('get_pawn_statuses RPC error:', error);
          return;
        }

        const map: Record<string, PawnStatusResult> = {};
        (data as RpcStatusRow[]).forEach((row) => {
          map[row.pawn_id] = {
            statusCode: row.status_code,
            status: '', // UI sẽ tự map sang label/description
          } as PawnStatusResult;
        });

        if (!isCancelled) {
          setStatuses(map);
        }
      } catch (err) {
        console.error('Error fetching pawn statuses:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchStatuses();

    return () => {
      isCancelled = true;
    };
  }, [JSON.stringify(pawnIds.sort())]);

  return { statuses, loading };
} 