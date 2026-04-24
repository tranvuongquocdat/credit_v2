"use client";

import { useState } from 'react';
import { StoreFundHistory, StoreFundHistoryFormData, TransactionType } from '@/models/storeFundHistory';
import { useStore } from '@/contexts/StoreContext';
import { RefreshCw } from 'lucide-react';
import { MoneyInput } from '@/components/ui/money-input';

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
  
  // Form state
  const [formData, setFormData] = useState<StoreFundHistoryFormData>({
    store_id: initialData?.store_id || currentStore?.id || '',
    fund_amount: initialData?.fund_amount || 0,
    transaction_type: initialData?.transaction_type || TransactionType.DEPOSIT,
    created_at: initialData?.created_at || new Date().toISOString(),
    note: initialData?.note || '',
    name: initialData?.name || ''
  });

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Handle form field changes
  const handleChange = (field: keyof StoreFundHistoryFormData, value: string | number | boolean) => {
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
    
    // Validation chặn rút quá quỹ đã bị gỡ trong PR3: currentStore.cash_fund
    // không còn có sẵn trong StoreContext, fund phải derive từ RPC. Nếu sau này
    // muốn có validation này, fetch RPC calc_cash_fund_as_of ở đây.

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

      {/* Customer Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Người góp vốn
        </label>
        <Input
          id="name"
          placeholder="Nhập tên người góp vốn"
          value={formData.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {/* Fund Amount */}
      <div>
        <MoneyInput
          id="fund_amount"
          label="Số tiền"
          required
          value={formData.fund_amount}
          onChange={(e) => {
            const numericValue = parseInt(e.target.value) || 0;
            handleChange('fund_amount', numericValue);
          }}
          error={errors.fund_amount}
          disabled={isSubmitting}
        />
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