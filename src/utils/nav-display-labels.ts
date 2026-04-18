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
    nuvoras_v2: 'Thuê tài sản',
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
  pawn_contract_label: {
    nuvoras_v2: 'Hợp đồng thuê tài sản',
    default: 'Hợp đồng cầm đồ',
  },
  collateral_for_pawn: {
    nuvoras_v2: 'Tài sản cho thuê',
    default: 'Tài sản thế chấp',
  },
  tien_cam: {
    nuvoras_v2: 'Giá trị tài sản',
    default: 'Tiền cầm',
  },
  cam_tu_ngay: {
    nuvoras_v2: 'Ngày thuê',
    default: 'Cầm từ ngày',
  },
  quan_ly_hop_dong_cam_do: {
    nuvoras_v2: 'Quản lý hợp đồng thuê tài sản',
    default: 'Quản lý hợp đồng cầm đồ',
  },
  title_build:{
    nuvoras_v2: 'Ubosa',
    default: 'Nuvoras',
  },
  chuoc_do: {
    nuvoras_v2: 'Thanh lý',
    default: 'Chuộc đồ',
  },
  da_chuoc_do: {
    nuvoras_v2: 'Đã thanh lý',
    default: 'Đã chuộc đồ',
  },
  dang_chuoc_do: {
    nuvoras_v2: 'Đang thanh lý',
    default: 'Đang chuộc đồ',
  },
  thanh_ly_va_tra_no: {
    nuvoras_v2: 'Thanh lý và trả nợ',
    default: 'Chuộc đồ và trả nợ',
  },
  thanh_ly_khong_tra_no: {
    nuvoras_v2: 'Thanh lý không trả nợ',
    default: 'Chuộc đồ và không trả nợ',
  },
  tong_so_tien_vay: {
    nuvoras_v2: 'Tổng giá trị tài sản',
    default: 'Tổng số tiền vay',
  },
  ky_lai_phi: {
    nuvoras_v2: 'Kỳ phí thuê',
    default: 'Kỳ lãi phí',
  },
  ngay_vay: {
    nuvoras_v2: 'Ngày thuê',
    default: 'Ngày vay',
   },
  lai_suat: {
    nuvoras_v2: 'Phí thuê',
    default: 'Lãi suất',
  },
  dang_vay: {
    nuvoras_v2: 'Đang thuê',
    default: 'Đang vay',
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
export function getDisplayLabelByBuild(key: NavDisplayLabelKey): string {
  const row = LABELS[key];
  const buildName = process.env.NEXT_PUBLIC_BUILD_NAME;
  return pickLabelForBuild(row, buildName);
}
