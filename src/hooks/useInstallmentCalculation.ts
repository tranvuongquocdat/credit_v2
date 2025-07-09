import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { InstallmentWithCustomer, InstallmentStatus } from '@/models/installment';
import { calculateRemainingToPay } from '@/lib/installmentCalculations';
import { calculateMultipleInstallmentStatus } from '@/lib/Installments/calculate_installment_status';

// Map trạng thái thành nhãn và màu sắc (fallback khi không lấy được từ RPC)
const statusMap: Record<string, { label: string; color: string }> = {
  [InstallmentStatus.ON_TIME]: { label: 'Đang vay', color: 'bg-green-100 text-green-800 border-green-200' },
  [InstallmentStatus.OVERDUE]: { label: 'Quá hạn', color: 'bg-red-100 text-red-800 border-red-200' },
  [InstallmentStatus.LATE_INTEREST]: { label: 'Chậm trả', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  [InstallmentStatus.BAD_DEBT]: { label: 'Nợ xấu', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  [InstallmentStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  [InstallmentStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  [InstallmentStatus.DUE_TOMORROW]: { label: 'Ngày mai đóng', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  [InstallmentStatus.FINISHED]: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export interface ProcessedInstallment extends InstallmentWithCustomer {
  /** Tổng tiền đã đóng */
  totalPaid: number;
  /** Số tiền còn phải đóng */
  remainingToPay: number;
  /** Nhãn ngày phải đóng tiếp theo – Hôm nay, Ngày mai, dd/MM */
  nextPaymentDate: string;
  /** Thông tin trạng thái đã được tính toán */
  statusInfo: {
    label: string;
    color: string;
  };
}

export function useInstallmentCalculation(
  installments: InstallmentWithCustomer[],
  precalculatedStatuses?: Record<string, any>
) {
  const [processedInstallments, setProcessedInstallments] = useState<ProcessedInstallment[]>([]);
  const [loading, setLoading] = useState(false);

  const compute = useCallback(async () => {
    if (installments.length === 0) {
      setProcessedInstallments([]);
      return;
    }

    setLoading(true);
    try {
      const ids = installments.map((i) => i.id);

      /** 1. Tổng tiền đã đóng */
      const { data: paidRows, error: paidError } = await supabase.rpc('installment_get_paid_amount', {
        p_installment_ids: ids,
      });
      if (paidError) {
        console.error('installment_get_paid_amount error:', paidError);
      }
      const paidMap = new Map<string, number>(
        (paidRows ?? []).map((r: any) => [r.installment_id, Number(r.total_paid ?? r.paid_amount ?? 0)])
      );
      /** 2. Tính trạng thái (dùng giá trị truyền vào nếu có) */
      const calculatedStatuses = precalculatedStatuses ?? await calculateMultipleInstallmentStatus(ids);

      /** 3. Build enriched list */
      const enriched: ProcessedInstallment[] = installments.map((it) => {
        const totalPaid = paidMap.get(it.id) ?? 0;
        const remaining = calculateRemainingToPay(it, totalPaid);

        // Tính nhãn ngày phải đóng tiếp theo
        let nextPaymentDateLabel: string;
        if (!it.payment_due_date) {
          nextPaymentDateLabel = 'Hoàn thành';
        } else {
          const due = new Date(it.payment_due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
          if (diff === 0) nextPaymentDateLabel = 'Hôm nay';
          else if (diff === 1) nextPaymentDateLabel = 'Ngày mai';
          else {
            const day = due.getDate().toString().padStart(2, '0');
            const month = (due.getMonth() + 1).toString().padStart(2, '0');
            nextPaymentDateLabel = `${day}/${month}`;
          }
        }

        // Map status info (ưu tiên kết quả từ RPC)
        const calcStatus = calculatedStatuses[it.id];
        let statusInfo: { label: string; color: string };
        if (calcStatus) {
          let color: string;
          switch (calcStatus.statusCode) {
            case 'CLOSED':
              color = 'bg-blue-100 text-blue-800 border-blue-200';
              break;
            case 'DELETED':
              color = 'bg-gray-100 text-gray-800 border-gray-200';
              break;
            case 'FINISHED':
              color = 'bg-emerald-100 text-emerald-800 border-emerald-200';
              break;
            case 'BAD_DEBT':
              color = 'bg-purple-100 text-purple-800 border-purple-200';
              break;
            case 'OVERDUE':
              color = 'bg-red-100 text-red-800 border-red-200';
              break;
            case 'LATE_INTEREST':
              color = 'bg-yellow-100 text-yellow-800 border-yellow-200';
              break;
            case 'ON_TIME':
            default:
              color = 'bg-green-100 text-green-800 border-green-200';
              break;
          }
          statusInfo = { label: calcStatus.status, color };
        } else {
          statusInfo = statusMap[it.status] || {
            label: 'Không xác định',
            color: 'bg-gray-100 text-gray-800',
          };
        }

        return {
          ...it,
          totalPaid,
          remainingToPay: remaining,
          nextPaymentDate: nextPaymentDateLabel,
          statusInfo,
        } as ProcessedInstallment;
      });

      setProcessedInstallments(enriched);
    } catch (err) {
      console.error('Error computing installment aggregates:', err);
    } finally {
      setLoading(false);
    }
  }, [installments, precalculatedStatuses]);

  useEffect(() => {
    compute();
  }, [compute]);

  return {
    processedInstallments,
    loading,
    refresh: compute,
  };
} 