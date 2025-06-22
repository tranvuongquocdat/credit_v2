import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditStatusResult } from '@/lib/Credits/calculate_credit_status';

interface RpcStatusRow {
  credit_id: string;
  status_code: CreditStatusResult['statusCode'];
}

/**
 * Hook lấy trạng thái hợp đồng tín chấp (chỉ những hợp đồng đưa vào).
 * Sử dụng PostgreSQL function `get_credit_statuses` để giảm round-trip.
 */
export function useCreditStatuses(creditIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, CreditStatusResult>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!creditIds || creditIds.length === 0) {
      setStatuses({});
      return;
    }

    let isCancelled = false;

    const fetchStatuses = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_credit_statuses', {
          p_credit_ids: creditIds,
        });

        if (error) {
          console.error('get_credit_statuses RPC error:', error);
          return;
        }

        const map: Record<string, CreditStatusResult> = {};
        (data as RpcStatusRow[]).forEach((row) => {
          map[row.credit_id] = {
            statusCode: row.status_code,
            status: '', // UI sẽ tự map sang label/description
          } as CreditStatusResult;
        });

        if (!isCancelled) {
          setStatuses(map);
        }
      } catch (err) {
        console.error('Error fetching credit statuses:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchStatuses();

    return () => {
      isCancelled = true;
    };
  }, [JSON.stringify(creditIds.sort())]);

  return { statuses, loading };
} 