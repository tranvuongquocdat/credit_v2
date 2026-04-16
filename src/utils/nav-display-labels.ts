/**
 * Nhãn điều hướng theo build (NEXT_PUBLIC_BUILD_NAME).
 * Client/server Next.js: chỉ dùng biến NEXT_PUBLIC_*.
 *
 * Key top-level = segment path (bỏ dấu `/` đầu), ví dụ `/credits` → `credits`, `/total-fund` → `total-fund`.
 * Mỗi row: bắt buộc `default`, thêm field tên build khi cần override.
 */

/** Một dòng nhãn: bắt buộc `default`, các key khác = tên build (chuỗi tùy ý). */
export type NavLabelRow = { default: string } & Record<string, string>;

const LABELS = {
  pawns: {
    nuvoras_v2: 'abc',
    default: 'Cầm đồ',
  },
  credits: {
    nuvoras: 'Tín chấp',
    nuvoras_v2: 'Tín chấp',
    default: 'Mượn tài sản',
  },
  installments: {
    default: 'Trả góp',
  },
  customers: {
    default: 'Khách hàng',
  },
  stores: {
    default: 'Cửa hàng',
  },
  capital: {
    default: 'Nguồn vốn',
  },
  income: {
    default: 'Thu chi',
  },
  employees: {
    default: 'Nhân viên',
  },
  'total-fund': {
    default: 'Quỹ',
  },
  reports: {
    default: 'Báo cáo',
  },
  admins: {
    default: 'Quản trị hệ thống',
  },
} as const satisfies Record<string, NavLabelRow>;

export type NavDisplayLabelKey = keyof typeof LABELS;

function pickLabelForBuild(
  row: (typeof LABELS)[NavDisplayLabelKey],
  buildName: string | undefined
): string {
  if (!buildName) return row.default;
  const value = (row as Record<string, string | undefined>)[buildName];
  if (typeof value === 'string' && value.length > 0) return value;
  return row.default;
}

export function isNuvorasBuild(): boolean {
  return process.env.NEXT_PUBLIC_BUILD_NAME === 'nuvoras';
}

/** Trả về chuỗi hiển thị theo key menu (trùng segment path) và build hiện tại. */
export function getNavDisplayLabel(key: NavDisplayLabelKey): string {
  const row = LABELS[key];
  const buildName = process.env.NEXT_PUBLIC_BUILD_NAME;
  return pickLabelForBuild(row, buildName);
}
