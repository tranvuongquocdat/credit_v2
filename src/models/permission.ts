export interface Permission {
  id: string;
  name: string;
  description?: string;
  parent_id?: string | null;
  module?: string;
  created_at: string;
}

export interface EmployeePermission {
  employee_id: string;
  permission_id: string;
  granted_by: string;
  granted_at: string;
}

export interface PermissionNode extends Permission {
  children?: PermissionNode[];
  checked?: boolean;
  indeterminate?: boolean;
  level?: number;
}

export interface EmployeePermissionFormData {
  employee_id: string;
  permission_ids: string[];
}

// Predefined permissions structure
export const DEFAULT_PERMISSIONS = [
  {
    id: 'cam_do',
    name: 'Càm đồ',
    module: 'cam_do',
    children: [
      { 
        id: 'xem_thong_tin_cam_do', 
        name: 'Xem thông tin quỹ tiền mặt, tiền đang vay, lãi dự kiến, lãi đã thu' 
      },
      { 
        id: 'xem_danh_sach_hop_dong_cam_do', 
        name: 'Xem danh sách hợp đồng' 
      },
      { 
        id: 'tao_moi_hop_dong_cam_do', 
        name: 'Tạo mới hợp đồng' 
      },
      { 
        id: 'sua_ngay_vay_cam_do', 
        name: 'Sửa ngày vay' 
      },
      { 
        id: 'sua_hop_dong_cam_do', 
        name: 'Sửa hợp đồng' 
      },
      { 
        id: 'xoa_hop_dong_cam_do', 
        name: 'Xóa hợp đồng' 
      },
      { 
        id: 'dong_lai_cam_do', 
        name: 'Đóng lãi' 
      },
      { 
        id: 'huy_dong_lai_cam_do', 
        name: 'Hủy đóng lãi' 
      },
      { 
        id: 'vay_them_goc_cam_do', 
        name: 'Vay thêm gốc' 
      },
      { 
        id: 'tra_bot_goc_cam_do', 
        name: 'Trả bớt gốc' 
      },
      { 
        id: 'chuoc_do_cam_do', 
        name: 'Chuộc đồ' 
      },
      { 
        id: 'sua_ngay_chuoc_do_cam_do', 
        name: 'Sửa ngày chuộc đồ' 
      },
      { 
        id: 'huy_chuoc_do_cam_do', 
        name: 'Hủy chuộc đồ' 
      }
    ]
  },
  {
    id: 'tin_chap',
    name: 'Tín chấp',
    module: 'tin_chap',
    children: [
      { 
        id: 'xem_thong_tin_tin_chap', 
        name: 'Xem thông tin quỹ tiền mặt, tiền đang vay, lãi dự kiến, lãi đã thu' 
      },
      { 
        id: 'xem_danh_sach_hop_dong_tin_chap', 
        name: 'Xem danh sách hợp đồng' 
      },
      { 
        id: 'tao_moi_hop_dong_tin_chap', 
        name: 'Tạo mới hợp đồng' 
      },
      { 
        id: 'sua_ngay_vay_tin_chap', 
        name: 'Sửa ngày vay' 
      },
      { 
        id: 'sua_hop_dong_tin_chap', 
        name: 'Sửa hợp đồng' 
      },
      { 
        id: 'xoa_hop_dong_tin_chap', 
        name: 'Xóa hợp đồng' 
      },
      { 
        id: 'dong_lai_tin_chap', 
        name: 'Đóng lãi' 
      },
      { 
        id: 'huy_dong_lai_tin_chap', 
        name: 'Hủy đóng lãi' 
      },
      { 
        id: 'vay_them_goc_tin_chap', 
        name: 'Vay thêm gốc' 
      },
      { 
        id: 'tra_bot_goc_tin_chap', 
        name: 'Trả bớt gốc' 
      },
      { 
        id: 'gia_han_tin_chap', 
        name: 'Gia hạn' 
      },
      { 
        id: 'dong_hop_dong_tin_chap', 
        name: 'Đóng hợp đồng' 
      },
      { 
        id: 'sua_ngay_dong_hop_dong_tin_chap', 
        name: 'Sửa ngày đóng hợp đồng' 
      },
      { 
        id: 'huy_dong_hop_dong_tin_chap', 
        name: 'Hủy đóng hợp đồng' 
      }
    ]
  },
  {
    id: 'tra_gop',
    name: 'Trả góp',
    module: 'tra_gop',
    children: [
      { 
        id: 'xem_thong_tin_tra_gop', 
        name: 'Xem thông tin quỹ tiền mặt, tiền đang vay, lãi dự kiến, lãi đã thu' 
      },
      { 
        id: 'xem_danh_sach_hop_dong_tra_gop', 
        name: 'Xem danh sách hợp đồng' 
      },
      { 
        id: 'tao_moi_hop_dong_tra_gop', 
        name: 'Tạo mới hợp đồng' 
      },
      { 
        id: 'sua_hop_dong_tra_gop', 
        name: 'Sửa hợp đồng' 
      },
      { 
        id: 'xoa_hop_dong_tra_gop', 
        name: 'Xóa hợp đồng' 
      },
      { 
        id: 'dong_lai_tra_gop', 
        name: 'Đóng lãi' 
      },
      { 
        id: 'huy_dong_lai_tra_gop', 
        name: 'Hủy đóng lãi' 
      },
      { 
        id: 'dong_hop_dong_tra_gop', 
        name: 'Đóng hợp đồng' 
      },
      { 
        id: 'huy_dong_hop_dong_tra_gop', 
        name: 'Hủy đóng hợp đồng' 
      }
    ]
  },
  {
    id: 'quan_ly_cua_hang',
    name: 'Quản lý cửa hàng',
    module: 'quan_ly_cua_hang',
    children: [
      { 
        id: 'tong_quat_chuoi_cua_hang', 
        name: 'Tổng quát chuỗi cửa hàng' 
      },
      { 
        id: 'thong_tin_chi_tiet_cua_hang', 
        name: 'Thông tin chi tiết cửa hàng' 
      },
      { 
        id: 'danh_sach_cua_hang', 
        name: 'Danh sách cửa hàng' 
      },
      { 
        id: 'cau_hinh_hang_hoa', 
        name: 'Cấu hình hàng hóa' 
      },
      { 
        id: 'nhap_tien_quy_dau_ngay', 
        name: 'Nhập tiền quỹ đầu ngày' 
      }
    ]
  },
  {
    id: 'quan_ly_khach_hang',
    name: 'Quản lý khách hàng',
    module: 'quan_ly_khach_hang',
    children: [
      { 
        id: 'xem_danh_sach_khach_hang', 
        name: 'Xem danh sách khách hàng' 
      }
    ]
  },
  {
    id: 'quan_ly_nguon_von',
    name: 'Quản lý nguồn vốn',
    module: 'quan_ly_nguon_von',
    children: [
      { 
        id: 'quan_ly_khau_von', 
        name: 'Quản lý khẩu vốn' 
      }
    ]
  },
  {
    id: 'quan_ly_nhan_vien',
    name: 'Quản lý nhân viên',
    module: 'quan_ly_nhan_vien',
    children: [
      { 
        id: 'danh_sach_nhan_vien', 
        name: 'Danh sách nhân viên' 
      },
      { 
        id: 'phan_quyen_nhan_vien', 
        name: 'Phân quyền nhân viên' 
      }
    ]
  },{
    id: 'thong_ke',
    name: 'Thống kê',
    module: 'thong_ke',
    children: [
      { 
        id: 'thu_tien_tin_chap', 
        name: 'Thu tiền tín chấp' 
      },
      { 
        id: 'thu_tien_tra_gop', 
        name: 'Thu tiền trả góp' 
      }
    ]
  },
  {
    id: 'bao_cao',
    name: 'Báo cáo',
    module: 'bao_cao',
    children: [
      { 
        id: 'so_quy_tien_mat', 
        name: 'Sổ quỹ tiền mặt' 
      },
      { 
        id: 'tong_ket_giao_dich', 
        name: 'Tổng kết giao dịch' 
      },
      { 
        id: 'tong_ket_loi_nhuan', 
        name: 'Tổng kết lợi nhuận' 
      },
      { 
        id: 'chi_tiet_tien_lai', 
        name: 'Chi tiết tiền lãi' 
      },
      { 
        id: 'bao_cao_dang_cho_vay', 
        name: 'Báo cáo đang cho vay' 
      },
      { 
        id: 'bao_cao_dong_hop_dong', 
        name: 'Báo cáo đóng hợp đồng' 
      },
      { 
        id: 'bao_cao_hop_dong_da_xoa', 
        name: 'Báo cáo hợp đồng đã xóa' 
      },
      { 
        id: 'dong_tien_theo_ngay', 
        name: 'Dòng tiền theo ngày' 
      }
    ]
  }
]; 