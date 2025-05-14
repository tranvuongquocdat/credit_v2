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
import { CreditPaymentPeriod } from '@/models/credit-payment';
import { formatCurrency } from '@/lib/utils';

interface PaymentFormData {
  actual_amount: number;
  payment_date: Date;
  notes: string;
}

interface MarkAsPaidDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PaymentFormData) => void;
  period: CreditPaymentPeriod | null;
}

export function MarkAsPaidDialog({
  isOpen,
  onClose,
  onSubmit,
  period
}: MarkAsPaidDialogProps) {
  const [formData, setFormData] = useState<PaymentFormData>({
    actual_amount: 0,
    payment_date: new Date(),
    notes: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PaymentFormData, string>>>({});

  // Khởi tạo form khi mở dialog
  useEffect(() => {
    if (period) {
      // Sử dụng ngày bắt đầu của kỳ làm ngày mặc định thay vì ngày hiện tại
      const startDate = new Date(period.start_date);
      
      setFormData({
        actual_amount: period.expected_amount,
        payment_date: startDate,
        notes: ''
      });
    }
    setErrors({});
  }, [isOpen, period]);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
    
    if (errors[name as keyof PaymentFormData]) {
      setErrors({
        ...errors,
        [name]: undefined
      });
    }
  };

  // Handle date changes
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData(prev => ({
        ...prev,
        payment_date: date
      }));
      
      if (errors.payment_date) {
        setErrors({
          ...errors,
          payment_date: undefined
        });
      }
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof PaymentFormData, string>> = {};
    
    if (!formData.payment_date) {
      newErrors.payment_date = 'Ngày đóng lãi là bắt buộc';
    }
    
    if (formData.actual_amount <= 0) {
      newErrors.actual_amount = 'Số tiền đã đóng phải lớn hơn 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  if (!period) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Đánh dấu đã đóng lãi</DialogTitle>
          <DialogDescription>
            Xác nhận kỳ {period.period_number} đã được đóng lãi
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Số tiền dự kiến */}
          <div className="space-y-2">
            <Label>Số tiền dự kiến</Label>
            <div className="p-2 border rounded bg-muted/20">
              {formatCurrency(period.expected_amount)}
            </div>
          </div>
          
          {/* Số tiền đã đóng - đã vô hiệu hóa */}
          <div className="space-y-2">
            <Label htmlFor="actual_amount">Số tiền đã đóng</Label>
            <div className="p-2 border rounded bg-muted/20">
              {formatCurrency(formData.actual_amount)}
            </div>
            <input 
              type="hidden" 
              name="actual_amount" 
              value={formData.actual_amount} 
            />
          </div>
          
          {/* Ngày đóng lãi */}
          <div className="space-y-2">
            <Label htmlFor="payment_date">Ngày đóng lãi <span className="text-destructive">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.payment_date && "text-muted-foreground",
                    errors.payment_date && "border-destructive"
                  )}
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
                  selected={formData.payment_date}
                  defaultMonth={formData.payment_date} // Hiển thị đúng tháng của ngày được chọn
                  onSelect={handleDateChange}
                  disabled={{
                    // Không cho phép chọn ngày trước ngày bắt đầu của kỳ
                    before: new Date(period.start_date),
                    // Không cho phép chọn ngày trong tương lai
                    after: new Date(period.end_date)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.payment_date && <p className="text-sm text-destructive">{errors.payment_date}</p>}
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
              placeholder="Nhập ghi chú nếu có..."
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="mr-2">
              Hủy
            </Button>
            <Button type="submit" variant="default">
              Xác nhận đã đóng
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
