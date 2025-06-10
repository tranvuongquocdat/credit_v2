"use client";
import { useState, useEffect } from 'react';
import { EmployeeFormData, EmployeeStatus, EmployeeWithProfile } from '@/models/employee';
import { Store } from '@/models/store';
import { getStores } from '@/lib/store';

interface EmployeeFormProps {
  employee?: EmployeeWithProfile;
  onSubmit: (data: EmployeeFormData) => Promise<void>;
  isSubmitting: boolean;
  isEditing?: boolean;
}

export default function EmployeeForm({ employee, onSubmit, isSubmitting, isEditing = false }: EmployeeFormProps) {
  const [formData, setFormData] = useState<EmployeeFormData>({
    full_name: '',
    store_id: null,
    phone: '',
    email: '',
    status: EmployeeStatus.WORKING,
    username: '',
    password: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof EmployeeFormData, string>>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);

  // Nếu đang chỉnh sửa nhân viên, cập nhật form
  useEffect(() => {
    if (employee) {
      setFormData({
        full_name: employee.full_name,
        store_id: employee.store_id,
        phone: employee.phone || '',
        email: employee.profiles?.email || '',
        status: employee.status,
        username: employee.profiles?.username || '',
        password: '' // Không hiển thị mật khẩu khi chỉnh sửa,
        
      });
    }
  }, [employee]);

  // Fetch danh sách cửa hàng
  useEffect(() => {
    const fetchStores = async () => {
      setIsLoadingStores(true);
      try {
        const { data } = await getStores(1, 100); // Lấy tối đa 100 cửa hàng
        setStores(data || []);
      } catch (error) {
        console.error('Error fetching stores:', error);
      } finally {
        setIsLoadingStores(false);
      }
    };

    fetchStores();
  }, []);

  // Xử lý thay đổi input
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Xóa thông báo lỗi khi người dùng nhập lại
    if (errors[name as keyof EmployeeFormData]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  // Xác thực form
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof EmployeeFormData, string>> = {};
    
    // Họ tên là bắt buộc
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Họ tên không được để trống';
    }
    
    // Username là bắt buộc
    if (!formData.username.trim()) {
      newErrors.username = 'Tên đăng nhập không được để trống';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Tên đăng nhập phải có ít nhất 3 ký tự';
    }
    
    // Password là bắt buộc khi tạo mới
    if (!isEditing && !formData.password) {
      newErrors.password = 'Mật khẩu không được để trống';
    } else if (formData.password && formData.password.length < 6) {
      newErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    }
    
    // Kiểm tra định dạng email nếu có
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email không hợp lệ';
    }
    
    // Kiểm tra định dạng số điện thoại nếu có
    if (formData.phone && !/^[0-9]{10,11}$/.test(formData.phone)) {
      newErrors.phone = 'Số điện thoại không hợp lệ';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Xử lý submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      await onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Họ tên */}
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
            Họ tên <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="full_name"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.full_name ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập họ tên nhân viên"
          />
          {errors.full_name && <p className="mt-1 text-sm text-red-500">{errors.full_name}</p>}
        </div>

        {/* Tên đăng nhập */}
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Tên đăng nhập <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            disabled={isEditing} // Không cho phép sửa username khi đang chỉnh sửa
            className={`w-full px-3 py-2 border rounded-md ${errors.username ? 'border-red-500' : 'border-gray-300'} ${isEditing ? 'bg-gray-100' : ''}`}
            placeholder="Nhập tên đăng nhập"
          />
          {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username}</p>}
        </div>

        {/* Mật khẩu */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Mật khẩu {!isEditing && <span className="text-red-500">*</span>}
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
            placeholder={isEditing ? "Để trống nếu không thay đổi" : "Nhập mật khẩu"}
          />
          {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
        </div>

        {/* Cửa hàng */}
        <div>
          <label htmlFor="store_id" className="block text-sm font-medium text-gray-700 mb-1">
            Cửa hàng
          </label>
          <select
            id="store_id"
            name="store_id"
            value={formData.store_id || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            disabled={isLoadingStores}
          >
            <option value="">-- Chọn cửa hàng --</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          {isLoadingStores && <p className="mt-1 text-sm text-gray-500">Đang tải danh sách cửa hàng...</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email || ''}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập email (không bắt buộc)"
          />
          {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
        </div>

        {/* Số điện thoại */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Số điện thoại
          </label>
          <input
            type="text"
            id="phone"
            name="phone"
            value={formData.phone || ''}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập số điện thoại (không bắt buộc)"
          />
          {errors.phone && <p className="mt-1 text-sm text-red-500">{errors.phone}</p>}
        </div>

        {/* Trạng thái */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Trạng thái
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value={EmployeeStatus.WORKING}>Đang làm việc</option>
            <option value={EmployeeStatus.INACTIVE}>Đã nghỉ việc</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end mt-6 space-x-3">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Đang xử lý...' : isEditing ? 'Cập nhật' : 'Tạo nhân viên'}
        </button>
      </div>
    </form>
  );
}
