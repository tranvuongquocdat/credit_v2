"use client";

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CreditPaymentPeriod, PaymentPeriodStatus } from '@/models/credit-payment';

interface PaymentPeriodFormData {
  start_date: Date;
  end_date: Date;
  expected_amount: number;
  actual_amount: number;
  payment_date: Date | null;
  notes: string;
}

interface PaymentPeriodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PaymentPeriodFormData) => void;
  mode: 'add' | 'edit';
  period?: CreditPaymentPeriod;
  title?: string;
}

export function PaymentPeriodDialog({
  isOpen,
  onClose,
  onSave,
  mode,
  period,
  title
}: PaymentPeriodDialogProps) {
  const [formData, setFormData] = useState<PaymentPeriodFormData>({
    start_date: new Date(),
    end_date: new Date(),
    expected_amount: 0,
    actual_amount: 0,
    payment_date: null,
    notes: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PaymentPeriodFormData, string>>>({});

  // Khởi tạo form khi mở dialog
  useEffect(() => {
    if (mode === 'edit' && period) {
      setFormData({
        start_date: new Date(period.start_date),
        end_date: new Date(period.end_date),
        expected_amount: period.expected_amount,
        actual_amount: period.actual_amount,
        payment_date: period.payment_date ? new Date(period.payment_date) : null,
        notes: period.notes || ''
      });
    } else {
      // Reset form khi thêm mới
      setFormData({
        start_date: new Date(),
        end_date: new Date(),
        expected_amount: 0,
        actual_amount: 0,
        payment_date: null,
        notes: ''
      });
    }
    setErrors({});
  }, [isOpen, mode, period]);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
    
    if (errors[name as keyof PaymentPeriodFormData]) {
      setErrors({
        ...errors,
        [name]: undefined
      });
    }
  };

  // Handle date changes
  const handleDateChange = (field: 'start_date' | 'end_date' | 'payment_date', date: Date | undefined) => {
    if (date) {
      setFormData(prev => ({
        ...prev,
        [field]: date
      }));
      
      if (errors[field]) {
        setErrors({
          ...errors,
          [field]: undefined
        });
      }
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PaymentPeriodFormData, string>> = {};
    
    if (!formData.start_date) {
      newErrors.start_date = 'Ngày bắt đầu là bắt buộc';
    }
    
    if (!formData.end_date) {
      newErrors.end_date = 'Ngày kết thúc là bắt buộc';
    } else if (formData.end_date < formData.start_date) {
      newErrors.end_date = 'Ngày kết thúc phải sau ngày bắt đầu';
    }
    
    if (formData.expected_amount <= 0) {
      newErrors.expected_amount = 'Số tiền dự kiến phải lớn hơn 0';
    }
    
    if (formData.actual_amount < 0) {
      newErrors.actual_amount = 'Số tiền đã đóng không được âm';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave(formData);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title || (mode === 'add' ? 'Thêm kỳ đóng lãi mới' : 'Chỉnh sửa kỳ đóng lãi')}</DialogTitle>
          <DialogDescription>
            {mode === 'add' 
              ? 'Điền thông tin để thêm một kỳ đóng lãi mới.' 
              : 'Cập nhật thông tin kỳ đóng lãi.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ngày bắt đầu */}
          <div className="space-y-2">
            <Label htmlFor="start_date">Ngày bắt đầu <span className="text-destructive">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.start_date && "text-muted-foreground",
                    errors.start_date && "border-destructive"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.start_date ? (
                    format(formData.start_date, "dd/MM/yyyy", { locale: vi })
                  ) : (
                    <span>Chọn ngày</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.start_date}
                  onSelect={(date) => handleDateChange('start_date', date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.start_date && <p className="text-sm text-destructive">{errors.start_date}</p>}
          </div>
          
          {/* Ngày kết thúc */}
          <div className="space-y-2">
            <Label htmlFor="end_date">Ngày kết thúc <span className="text-destructive">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.end_date && "text-muted-foreground",
                    errors.end_date && "border-destructive"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.end_date ? (
                    format(formData.end_date, "dd/MM/yyyy", { locale: vi })
                  ) : (
                    <span>Chọn ngày</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.end_date}
                  onSelect={(date) => handleDateChange('end_date', date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.end_date && <p className="text-sm text-destructive">{errors.end_date}</p>}
          </div>
          
          {/* Số tiền dự kiến */}
          <div className="space-y-2">
            <Label htmlFor="expected_amount">Số tiền dự kiến <span className="text-destructive">*</span></Label>
            <Input
              id="expected_amount"
              name="expected_amount"
              type="number"
              value={formData.expected_amount}
              onChange={handleChange}
              className={cn(errors.expected_amount && "border-destructive")}
            />
            {errors.expected_amount && <p className="text-sm text-destructive">{errors.expected_amount}</p>}
          </div>
          
          {/* Số tiền đã đóng */}
          <div className="space-y-2">
            <Label htmlFor="actual_amount">Số tiền đã đóng</Label>
            <Input
              id="actual_amount"
              name="actual_amount"
              type="number"
              value={formData.actual_amount}
              onChange={handleChange}
              className={cn(errors.actual_amount && "border-destructive")}
            />
            {errors.actual_amount && <p className="text-sm text-destructive">{errors.actual_amount}</p>}
          </div>
          
          {/* Ngày đóng lãi */}
          <div className="space-y-2">
            <Label htmlFor="payment_date">Ngày đóng lãi</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.payment_date ? (
                    format(formData.payment_date, "dd/MM/yyyy", { locale: vi })
                  ) : (
                    <span>Chọn ngày</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.payment_date || undefined}
                  onSelect={(date) => handleDateChange('payment_date', date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          {/* Ghi chú */}
          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
            />
          </div>
          
          <DialogFooter>
            <Button type="submit">{mode === 'add' ? 'Thêm' : 'Cập nhật'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
