/**
 * Credit Status Utilities
 * Shared utilities for credit status handling and display
 */

export interface StatusInfo {
  label: string;
  color: string;
}

/**
 * Map status codes to Vietnamese labels and Tailwind CSS colors
 * These status codes come from the credits_by_store database view
 */
export const CREDIT_STATUS_MAP: Record<string, StatusInfo> = {
  // Database view status codes
  'ON_TIME': {
    label: 'Đang vay',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  'LATE_INTEREST': {
    label: 'Chậm lãi', 
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200'
  },
  'OVERDUE': {
    label: 'Quá hạn',
    color: 'bg-red-100 text-red-800 border-red-200'
  },
  'FINISHED': {
    label: 'Hoàn thành',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  'CLOSED': {
    label: 'Đã đóng',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  'DELETED': {
    label: 'Đã xóa',
    color: 'bg-gray-100 text-gray-800 border-gray-200'
  },
  'BAD_DEBT': {
    label: 'Nợ xấu',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  },
};

/**
 * Get status information (label and color) for a given status code
 */
export function getCreditStatusInfo(statusCode: string): StatusInfo {
  return CREDIT_STATUS_MAP[statusCode] || CREDIT_STATUS_MAP['ON_TIME'];
}

/**
 * Get status label for a given status code
 */
export function getCreditStatusLabel(statusCode: string): string {
  return getCreditStatusInfo(statusCode).label;
}

/**
 * Get status color for a given status code
 */
export function getCreditStatusColor(statusCode: string): string {
  return getCreditStatusInfo(statusCode).color;
}

/**
 * Check if a status code represents an active credit (being loaned)
 */
export function isCreditActive(statusCode: string): boolean {
  return ['ON_TIME', 'LATE_INTEREST', 'OVERDUE'].includes(statusCode);
}

/**
 * Check if a status code represents a completed credit
 */
export function isCreditCompleted(statusCode: string): boolean {
  return ['FINISHED', 'CLOSED'].includes(statusCode);
}

/**
 * Check if a status code represents a problematic credit
 */
export function isCreditProblematic(statusCode: string): boolean {
  return ['OVERDUE', 'LATE_INTEREST', 'BAD_DEBT'].includes(statusCode);
}

/**
 * Get all active status codes (for filtering)
 */
export function getActiveCreditStatuses(): string[] {
  return ['ON_TIME', 'LATE_INTEREST', 'OVERDUE'];
}

/**
 * Get all completed status codes (for filtering)  
 */
export function getCompletedCreditStatuses(): string[] {
  return ['FINISHED', 'CLOSED'];
}

/**
 * Legacy status code mapping for backward compatibility
 * Maps old enum values to new status codes
 */
export const LEGACY_STATUS_MAP: Record<string, string> = {
  'on_time': 'ON_TIME',
  'late_interest': 'LATE_INTEREST', 
  'overdue': 'OVERDUE',
  'finished': 'FINISHED',
  'closed': 'CLOSED',
  'deleted': 'DELETED',
  'bad_debt': 'BAD_DEBT',
};

/**
 * Convert legacy status to new status code
 */
export function legacyStatusToStatusCode(legacyStatus: string): string {
  return LEGACY_STATUS_MAP[legacyStatus] || 'ON_TIME';
}