import { supabase } from '../supabase';

export interface InstallmentStatusResult {
  status: string;
  statusCode: string;
  description?: string;
}

/**
 * Tính toán status hiển thị cho installment dựa trên các điều kiện nghiệp vụ
 * @param installmentId - ID của installment cần tính status
 * @returns Promise<InstallmentStatusResult> - Kết quả status và mô tả
 */
export async function calculateInstallmentStatus(installmentId: string): Promise<InstallmentStatusResult> {
  const { data, error } = await supabase
    .rpc('get_installment_statuses', { p_installment_ids: [installmentId] });

  if (error) throw error;

  return {
    status: data[0].status,
    statusCode: data[0].status_code,
    description: data[0].description,
  };
}

/**
 * Tính toán status cho nhiều installments cùng lúc
 * @param installmentIds - Mảng các ID của installments cần tính status
 * @returns Promise<Record<string, InstallmentStatusResult>> - Object với key là installmentId và value là status result
 */
export async function calculateMultipleInstallmentStatus(
  installmentIds: string[],
): Promise<Record<string, InstallmentStatusResult>> {
  const { data, error } = await supabase
    .rpc('get_installment_statuses', { p_installment_ids: installmentIds });

  if (error) throw error;

  const map: Record<string, InstallmentStatusResult> = {};
  data.forEach((row: any) => {
    map[row.installment_id] = {
      status: row.status,
      statusCode: row.status_code,
      description: row.description,
    };
  });
  return map;
} 