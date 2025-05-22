"use client";

import { useState } from 'react';
import { StoreFundHistory, StoreFundHistoryFormData, TransactionType } from '@/models/storeFundHistory';
import { useStore } from '@/contexts/StoreContext';
import { RefreshCw } from 'lucide-react';

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from '../ui/date-picker';

interface StoreFundHistoryFormProps {
  initialData?: StoreFundHistory | null;
  onSubmit: (data: StoreFundHistoryFormData) => void;
  isSubmitting?: boolean;
  hideButtons?: boolean;
}

export function StoreFundHistoryForm({
  initialData,
  onSubmit,
  isSubmitting = false,
  hideButtons = false
}: StoreFundHistoryFormProps) {
  const { currentStore } = useStore();
  
  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    // Convert to number and back to string to remove non-numeric characters
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    // Format with thousand separators
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  
  // Form state
  const [formData, setFormData] = useState<StoreFundHistoryFormData>({
    store_id: initialData?.store_id || currentStore?.id || '',
    fund_amount: initialData?.fund_amount || 0,
    transaction_type: initialData?.transaction_type || TransactionType.DEPOSIT,
    created_at: initialData?.created_at || new Date().toISOString(),
    note: initialData?.note || ''
  });
  
  // Formatted fund amount for display
  const [formattedAmount, setFormattedAmount] = useState<string>(
    formatNumber(initialData?.fund_amount || 0)
  );

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Format currency for display only
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  // Handle form field changes
  const handleChange = (field: keyof StoreFundHistoryFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };
  
  // Handle fund amount change with formatting
  const handleFundAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    const numericValue = parseInt(rawValue) || 0;
    
    // Update the raw value in form data
    handleChange('fund_amount', numericValue);
    
    // Update the formatted display value
    setFormattedAmount(formatNumber(rawValue));
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const newErrors: Record<string, string> = {};
    
    if (!formData.store_id) {
      newErrors.store_id = 'Cửa hàng là bắt buộc';
    }
    
    if (!formData.fund_amount || formData.fund_amount <= 0) {
      newErrors.fund_amount = 'Số tiền phải lớn hơn 0';
    }
    
    if (!formData.transaction_type) {
      newErrors.transaction_type = 'Loại giao dịch là bắt buộc';
    }
    
    // Validate withdrawal amount doesn't exceed current cash fund
    if (
      formData.transaction_type === TransactionType.WITHDRAWAL && 
      currentStore?.cash_fund !== undefined && 
      formData.fund_amount > currentStore.cash_fund
    ) {
      newErrors.fund_amount = `Số tiền rút không thể vượt quá quỹ tiền mặt hiện tại (${formatCurrency(currentStore.cash_fund)})`;
    }
    
    // If there are errors, show them and don't submit
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Submit form
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Transaction Type */}
      <div>
        <label htmlFor="transaction_type" className="block text-sm font-medium text-gray-700 mb-1">
          Loại giao dịch <span className="text-red-500">*</span>
        </label>
        <Select
          value={formData.transaction_type}
          onValueChange={(value) => handleChange('transaction_type', value)}
          disabled={isSubmitting}
        >
          <SelectTrigger id="transaction_type" className={`w-full ${errors.transaction_type ? 'border-red-500' : ''}`}>
            <SelectValue placeholder="Chọn loại giao dịch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TransactionType.DEPOSIT}>Nạp vốn</SelectItem>
            <SelectItem value={TransactionType.WITHDRAWAL}>Rút vốn</SelectItem>
          </SelectContent>
        </Select>
        {errors.transaction_type && (
          <p className="text-sm text-red-500 mt-1">{errors.transaction_type}</p>
        )}
      </div>

      {/* Fund Amount */}
      <div>
        <label htmlFor="fund_amount" className="block text-sm font-medium text-gray-700 mb-1">
          Số tiền <span className="text-red-500">*</span>
        </label>
        <Input
          id="fund_amount"
          type="text"
          inputMode="numeric"
          value={formattedAmount}
          onChange={handleFundAmountChange}
          className={errors.fund_amount ? 'border-red-500' : ''}
          disabled={isSubmitting}
        />
        {errors.fund_amount && (
          <p className="text-sm text-red-500 mt-1">{errors.fund_amount}</p>
        )}
        {formData.transaction_type === TransactionType.WITHDRAWAL && currentStore?.cash_fund !== undefined && (
          <p className="text-xs text-gray-500 mt-1">
            Quỹ tiền mặt hiện tại: {formatCurrency(currentStore.cash_fund)}
          </p>
        )}
      </div>
      {/* Date */}
      <div>
        <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
          Ngày <span className="text-red-500">*</span>
        </label>
        <DatePicker
          id="date"
          value={formData.created_at}
          onChange={(value) => handleChange('created_at', value)}
          disabled={isSubmitting}
        />
      </div>
      {/* Note */}
      <div>
        <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
          Ghi chú
        </label>
        <Textarea
          id="note"
          placeholder="Nhập ghi chú cho giao dịch này"
          value={formData.note || ''}
          onChange={(e) => handleChange('note', e.target.value)}
          disabled={isSubmitting}
          rows={3}
        />
      </div>

      {/* Submit Buttons */}
      {!hideButtons && (
        <div className="flex justify-end space-x-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Cập nhật' : 'Thêm mới'}
          </Button>
        </div>
      )}
    </form>
  );
} 