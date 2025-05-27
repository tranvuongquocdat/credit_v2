import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { vi } from "date-fns/locale";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as currency in VND
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Hàm tính chính xác số ngày giữa hai ngày (inclusive)
export const calculateDaysBetween = (startDate: Date, endDate: Date): number => {
  // Chuẩn hóa về đầu ngày để tránh sai lệch do giờ/phút/giây
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  // Tính ngày (bao gồm cả ngày đầu và cuối)
  return (
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
};

// Format date helper
export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "-";
  try {
    return format(new Date(dateString), "dd/MM/yyyy", { locale: vi });
  } catch (error) {
    return "-";
  }
};

export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  try {
    return format(new Date(dateString), 'dd-MM-yyyy HH:mm:ss', { locale: vi });
  } catch (error) {
    return '-';
  }
};
// Helper function to format number with thousand separators for input
export const formatNumberInput = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Helper function to parse formatted number back to number
export const parseFormattedNumber = (str: string): number => {
  return parseInt(str.replace(/\./g, "")) || 0;
};

// Helper to format number with commas
export const formatNumberWithCommas = (value: number): string => {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};