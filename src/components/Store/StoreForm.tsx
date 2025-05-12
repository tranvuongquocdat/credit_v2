"use client";
import { useState, useEffect } from 'react';
import { Store, StoreFormData, StoreStatus } from '@/models/store';

interface StoreFormProps {
  store?: Store;
  onSubmit: (data: StoreFormData) => Promise<void>;
  isSubmitting: boolean;
}

export default function StoreForm({ store, onSubmit, isSubmitting }: StoreFormProps) {
  const [formData, setFormData] = useState<StoreFormData>({
    name: '',
    address: '',
    phone: '',
    investment: 0,
    cash_fund: 0,
    status: StoreStatus.ACTIVE
  });

  const [errors, setErrors] = useState<Partial<Record<keyof StoreFormData, string>>>({});

  // Nếu có dữ liệu cửa hàng, cập nhật form
  useEffect(() => {
    if (store) {
      setFormData({
        name: store.name,
        address: store.address,
        phone: store.phone,
        investment: store.investment,
        cash_fund: store.cash_fund,
        status: store.status
      });
    }
  }, [store]);

  // Xử lý thay đổi input
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
    
    // Xóa thông báo lỗi khi người dùng nhập lại
    if (errors[name as keyof StoreFormData]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  // Xác thực form
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof StoreFormData, string>> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Tên cửa hàng không được để trống';
    }
    
    if (!formData.address.trim()) {
      newErrors.address = 'Địa chỉ không được để trống';
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Số điện thoại không được để trống';
    } else if (!/^[0-9]{10,11}$/.test(formData.phone)) {
      newErrors.phone = 'Số điện thoại không hợp lệ';
    }
    
    if (formData.investment < 0) {
      newErrors.investment = 'Vốn đầu tư không được âm';
    }
    
    if (formData.cash_fund < 0) {
      newErrors.cash_fund = 'Quỹ tiền mặt không được âm';
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
  
  // Format number to currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tên cửa hàng */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Tên cửa hàng <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập tên cửa hàng"
          />
          {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
        </div>

        {/* Số điện thoại */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Số điện thoại <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập số điện thoại"
          />
          {errors.phone && <p className="mt-1 text-sm text-red-500">{errors.phone}</p>}
        </div>

        {/* Địa chỉ */}
        <div className="md:col-span-2">
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
            Địa chỉ <span className="text-red-500">*</span>
          </label>
          <textarea
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            rows={2}
            className={`w-full px-3 py-2 border rounded-md ${errors.address ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập địa chỉ cửa hàng"
          />
          {errors.address && <p className="mt-1 text-sm text-red-500">{errors.address}</p>}
        </div>

        {/* Vốn đầu tư */}
        <div>
          <label htmlFor="investment" className="block text-sm font-medium text-gray-700 mb-1">
            Vốn đầu tư (VNĐ)
          </label>
          <input
            type="number"
            id="investment"
            name="investment"
            value={formData.investment}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.investment ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập vốn đầu tư"
          />
          {formData.investment > 0 && (
            <p className="mt-1 text-sm text-gray-500">{formatCurrency(formData.investment)}</p>
          )}
          {errors.investment && <p className="mt-1 text-sm text-red-500">{errors.investment}</p>}
        </div>

        {/* Quỹ tiền mặt */}
        <div>
          <label htmlFor="cash_fund" className="block text-sm font-medium text-gray-700 mb-1">
            Quỹ tiền mặt (VNĐ)
          </label>
          <input
            type="number"
            id="cash_fund"
            name="cash_fund"
            value={formData.cash_fund}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${errors.cash_fund ? 'border-red-500' : 'border-gray-300'}`}
            placeholder="Nhập quỹ tiền mặt"
          />
          {formData.cash_fund > 0 && (
            <p className="mt-1 text-sm text-gray-500">{formatCurrency(formData.cash_fund)}</p>
          )}
          {errors.cash_fund && <p className="mt-1 text-sm text-red-500">{errors.cash_fund}</p>}
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
            <option value={StoreStatus.ACTIVE}>Hoạt động</option>
            <option value={StoreStatus.SUSPENDED}>Tạm ngưng</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end mt-6 space-x-3">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Đang xử lý...' : store ? 'Cập nhật' : 'Tạo cửa hàng'}
        </button>
      </div>
    </form>
  );
}
