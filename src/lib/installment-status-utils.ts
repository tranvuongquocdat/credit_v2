/**
 * Utility functions for installment status mapping
 * Maps status_code from database view to Vietnamese labels and colors
 */

export interface StatusInfo {
  label: string;
  color: string;
}

/**
 * Map status codes to Vietnamese labels and Tailwind CSS colors
 * These status codes come from the installments_by_store database view
 */
export const INSTALLMENT_STATUS_MAP: Record<string, StatusInfo> = {
  // Database view status codes
  'ON_TIME': {
    label: 'Đang vay',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  'OVERDUE': {
    label: 'Quá hạn',
    color: 'bg-red-100 text-red-800 border-red-200'
  },
  'LATE_INTEREST': {
    label: 'Chậm trả',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200'
  },
  'BAD_DEBT': {
    label: 'Nợ xấu',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  'CLOSED': {
    label: 'Đã đóng',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  'DELETED': {
    label: 'Đã xóa',
    color: 'bg-gray-100 text-gray-800 border-gray-200'
  },
  // Additional calculated statuses (may be computed in frontend)
  'DUE_TOMORROW': {
    label: 'Ngày mai đóng',
    color: 'bg-amber-100 text-amber-800 border-amber-200'
  },
  'FINISHED': {
    label: 'Hoàn thành',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
};

/**
 * Get status info (label and color) for a given status code
 * @param statusCode - The status code from database view or calculated
 * @returns StatusInfo object with Vietnamese label and Tailwind CSS color
 */
export function getInstallmentStatusInfo(statusCode: string): StatusInfo {
  return INSTALLMENT_STATUS_MAP[statusCode] || {
    label: 'Không xác định',
    color: 'bg-gray-100 text-gray-800 border-gray-200'
  };
}

/**
 * Get the status code from installment data
 * Uses status_code from database view if available, otherwise falls back to status
 * @param installment - Installment data object
 * @returns Status code string
 */
export function getInstallmentStatusCode(installment: any): string {
  // First try to get from database view's status_code field
  if (installment.status_code) {
    return installment.status_code;
  }
  
  // Fallback to raw status field (should not happen with new view)
  return installment.status || 'ON_TIME';
}