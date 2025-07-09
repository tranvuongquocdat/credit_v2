import { useEffect, useState } from 'react';
import { calculateMultipleInstallmentStatus } from '@/lib/Installments/calculate_installment_status';

/**
 * Client-side hook lấy trạng thái của nhiều hợp đồng trả góp.
 * Trả về Map<installmentId, statusResult>
 */
export function useInstallmentStatuses(ids: string[]) {
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ids.length) {
      setStatuses({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await calculateMultipleInstallmentStatus(ids);
        if (!cancelled) setStatuses(res);
      } catch (err) {
        console.error('useInstallmentStatuses error:', err);
        if (!cancelled) setStatuses({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ids.join(',')]);

  return { statuses, loading } as const;
} 