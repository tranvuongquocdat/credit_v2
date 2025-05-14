"use client";

import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isBefore, differenceInDays } from 'date-fns';
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
import { calculateExpectedAmountForDateRange } from '@/utils/payment-calculator';
import { Credit } from '@/models/credit';

interface PaymentPeriodFormData {
  start_date: Date;
  end_date: Date;
  expected_amount: number;
  actual_amount: number;
  additional_amount: number; // Thêm số tiền khác
  notes: string;
}

interface PaymentPeriodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PaymentPeriodFormData) => void;
  mode: 'add' | 'edit';
  period?: CreditPaymentPeriod;
  title?: string;
  credit: Credit;
  allPeriods?: CreditPaymentPeriod[];
}

export function PaymentPeriodDialog({
  isOpen,
  onClose,
  onSave,
  mode,
  period,
  title,
  credit,
  allPeriods = []
}: PaymentPeriodDialogProps) {
  const [formData, setFormData] = useState<PaymentPeriodFormData>({
    start_date: new Date(),
    end_date: new Date(),
    expected_amount: 0,
    actual_amount: 0,
    additional_amount: 0,
    notes: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PaymentPeriodFormData, string>>>({});
  
  // Tìm kỳ gần nhất chưa được đóng để giới hạn ngày bắt đầu
  const earliestUnpaidDate = useMemo(() => {
    if (!allPeriods || allPeriods.length === 0) {
      return new Date(credit.loan_date);
    }
    
    // Lọc các kỳ chưa đóng
    const unpaidPeriods = allPeriods.filter(p => 
      p.status === PaymentPeriodStatus.PENDING || 
      p.status === PaymentPeriodStatus.OVERDUE
    );
    
    if (unpaidPeriods.length === 0) {
      return new Date(credit.loan_date);
    }
    
    // Sắp xếp theo ngày bắt đầu
    unpaidPeriods.sort((a, b) => {
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return dateA - dateB;
    });
    
    // Trả về ngày bắt đầu của kỳ đầu tiên chưa đóng
    return new Date(unpaidPeriods[0].start_date);
  }, [allPeriods, credit]);
  
  // Tính toán số tiền dự kiến dựa trên khoảng thời gian và số tiền chuẩn mỗi kỳ
  const calculatedBaseAmount = useMemo(() => {
    if (!formData.start_date || !formData.end_date) {
      return 0;
    }
    
    // Create normalized dates (only keep year, month, day) to calculate calendar days
    const normalizedStartDate = new Date(
      formData.start_date.getFullYear(),
      formData.start_date.getMonth(),
      formData.start_date.getDate()
    );
    const normalizedEndDate = new Date(
      formData.end_date.getFullYear(),
      formData.end_date.getMonth(),
      formData.end_date.getDate()
    );
    
    // Tính số ngày trong khoảng thời gian
    const days = differenceInDays(normalizedEndDate, normalizedStartDate) + 1;
    if (days <= 0) return 0;
    
    let baseAmount = 0;
    
    if (credit.interest_type === 'percentage') {
      // Số tiền lãi chuẩn cho 1 ngày
      const dailyInterestRate = credit.interest_value / 100 / 30; // Lãi suất hàng ngày
      
      // Công thức: Số tiền vay * lãi suất hàng ngày * số ngày * interest_period (30 ngày)
      baseAmount = credit.loan_amount * dailyInterestRate * days * 30;
    } else {
      // Nếu là lãi suất cố định, tính tỷ lệ theo ngày
      const dailyAmount = credit.interest_value / credit.interest_period;
      baseAmount = dailyAmount * days * credit.interest_period;
    }
    
    return Math.round(baseAmount);
  }, [credit, formData.start_date, formData.end_date]);
  
  // Tổng số tiền bao gồm cả số tiền thêm
  const totalAmount = useMemo(() => {
    return calculatedBaseAmount + (formData.additional_amount || 0);
  }, [calculatedBaseAmount, formData.additional_amount]);
  
  // Cập nhật số tiền dự kiến khi khoảng thời gian hoặc số tiền thêm thay đổi
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      expected_amount: totalAmount
    }));
  }, [totalAmount]);

  // Khởi tạo form khi mở dialog
  useEffect(() => {
    let initialFormData: PaymentPeriodFormData;
    
    if (mode === 'edit' && period) {
      // Đảm bảo ngày kết thúc không trước ngày bắt đầu
      const startDate = new Date(period.start_date);
      let endDate = new Date(period.end_date);
      if (endDate < startDate) {
        endDate = new Date(startDate);
      }
      
      initialFormData = {
        start_date: startDate,
        end_date: endDate,
        expected_amount: period.expected_amount,
        actual_amount: period.actual_amount,
        additional_amount: 0, // Mặc định là 0 cho số tiền thêm
        notes: period.notes || ''
      };
    } else {
      // Reset form khi thêm mới
      const startDate = earliestUnpaidDate;
      // Đảm bảo ngày kết thúc không trước ngày bắt đầu
      let endDate = new Date();
      if (endDate < startDate) {
        endDate = new Date(startDate);
      }
      
      // Tính ngay số tiền dự kiến dựa trên ngày bắt đầu và kết thúc
      // Normalize dates for accurate calendar day calculation
      const normalizedStartDate = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
      );
      const normalizedEndDate = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate()
      );
      
      const days = differenceInDays(normalizedEndDate, normalizedStartDate) + 1;
      let baseAmount = 0;
      
      if (days > 0) {
        if (credit.interest_type === 'percentage') {
          // Số tiền lãi chuẩn cho 1 ngày
          const dailyInterestRate = credit.interest_value / 100 / 30; // Lãi suất hàng ngày
          
          // Công thức: Số tiền vay * lãi suất hàng ngày * số ngày * interest_period
          baseAmount = credit.loan_amount * dailyInterestRate * days * 30;
        } else {
          // Nếu là lãi suất cố định, tính tỷ lệ theo ngày
          const dailyAmount = credit.interest_value / credit.interest_period;
          baseAmount = dailyAmount * days * credit.interest_period;
        }
        
        baseAmount = Math.round(baseAmount);
      }
      
      initialFormData = {
        start_date: startDate,
        end_date: endDate,
        expected_amount: baseAmount,
        actual_amount: 0,
        additional_amount: 0,
        notes: ''
      };
    }
    
    // Cập nhật form data ban đầu
    setFormData(initialFormData);
    setErrors({});
    
    // Force an immediate calculation after a brief delay to ensure rendering is complete
    const timer = setTimeout(() => {
      if (initialFormData.start_date && initialFormData.end_date) {
        // Normalize dates for accurate calendar day calculation
        const normalizedStartDate = new Date(
          initialFormData.start_date.getFullYear(),
          initialFormData.start_date.getMonth(),
          initialFormData.start_date.getDate()
        );
        const normalizedEndDate = new Date(
          initialFormData.end_date.getFullYear(),
          initialFormData.end_date.getMonth(),
          initialFormData.end_date.getDate()
        );
        
        const days = differenceInDays(normalizedEndDate, normalizedStartDate) + 1;
        
        if (days > 0) {
          let newBaseAmount = 0;
          
          if (credit.interest_type === 'percentage') {
            // Số tiền lãi chuẩn cho 1 ngày
            const dailyInterestRate = credit.interest_value / 100 / 30; // Lãi suất hàng ngày
            
            // Công thức: Số tiền vay * lãi suất hàng ngày * số ngày * interest_period
            newBaseAmount = Math.round(credit.loan_amount * dailyInterestRate * days * 30);
          } else {
            // Nếu là lãi suất cố định, tính tỷ lệ theo ngày
            const dailyAmount = credit.interest_value / credit.interest_period;
            newBaseAmount = Math.round(dailyAmount * days * credit.interest_period);
          }
          
          setFormData(current => ({
            ...current,
            expected_amount: newBaseAmount + (current.additional_amount || 0)
          }));
        }
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, [isOpen, mode, period, earliestUnpaidDate, credit]);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? parseFloat(value) || 0 : value;
    
    // Create a copy of the form data
    const updatedFormData = { ...formData };
    
    // Update the relevant field with type safety
    if (name === 'notes') {
      updatedFormData.notes = value as string;
    } else if (name === 'additional_amount') {
      updatedFormData.additional_amount = parsedValue as number;
    } else if (name === 'actual_amount') {
      updatedFormData.actual_amount = parsedValue as number;
    }
    
    // If changing additional_amount, update the expected_amount as well
    if (name === 'additional_amount' && type === 'number') {
      // Calculate base amount from days
      if (updatedFormData.start_date && updatedFormData.end_date) {
        // Normalize dates for accurate calendar day counting
        const normalizedStartDate = new Date(
          updatedFormData.start_date.getFullYear(),
          updatedFormData.start_date.getMonth(),
          updatedFormData.start_date.getDate()
        );
        const normalizedEndDate = new Date(
          updatedFormData.end_date.getFullYear(),
          updatedFormData.end_date.getMonth(),
          updatedFormData.end_date.getDate()
        );
        
        const days = differenceInDays(normalizedEndDate, normalizedStartDate) + 1;
        
        if (days > 0) {
          let baseAmount = 0;
          
          if (credit.interest_type === 'percentage') {
            // Số tiền lãi chuẩn cho 1 ngày
            const dailyInterestRate = credit.interest_value / 100 / 30; // Lãi suất hàng ngày
            
            // Công thức: Số tiền vay * lãi suất hàng ngày * số ngày * interest_period
            baseAmount = credit.loan_amount * dailyInterestRate * days * 30;
          } else {
            // Nếu là lãi suất cố định, tính tỷ lệ theo ngày
            const dailyAmount = credit.interest_value / credit.interest_period;
            baseAmount = dailyAmount * days * credit.interest_period;
          }
          
          // Update the expected amount with the new additional amount
          updatedFormData.expected_amount = Math.round(baseAmount) + (parseFloat(value) || 0);
        }
      }
    }
    
    // Update the form data
    setFormData(updatedFormData);
    
    // Clear any errors for this field
    if (errors[name as keyof PaymentPeriodFormData]) {
      setErrors({
        ...errors,
        [name]: undefined
      });
    }
  };

  // Handle date changes
  const handleDateChange = (field: 'start_date' | 'end_date', newDate: Date | undefined) => {
    if (!newDate) return; // Skip if no date is provided
    
    // Create a copy of the form data to work with
    const updatedFormData = { ...formData };
    
    // Update the relevant field
    if (field === 'start_date') {
      // If the new start date is after the current end date, set end date to match
      if (updatedFormData.end_date && newDate > updatedFormData.end_date) {
        updatedFormData.start_date = newDate;
        updatedFormData.end_date = new Date(newDate);
      } else {
        updatedFormData.start_date = newDate;
      }
    } else if (field === 'end_date') {
      // If the new end date is before the current start date, adjust it
      if (updatedFormData.start_date && newDate < updatedFormData.start_date) {
        updatedFormData.end_date = new Date(updatedFormData.start_date);
      } else {
        updatedFormData.end_date = newDate;
      }
    }
    
    // Calculate the number of days and update the amount
    if (updatedFormData.start_date && updatedFormData.end_date) {
      // Create normalized dates (only keep year, month, day) to calculate calendar days
      const normalizedStartDate = new Date(
        updatedFormData.start_date.getFullYear(),
        updatedFormData.start_date.getMonth(),
        updatedFormData.start_date.getDate()
      );
      const normalizedEndDate = new Date(
        updatedFormData.end_date.getFullYear(),
        updatedFormData.end_date.getMonth(),
        updatedFormData.end_date.getDate()
      );
      
      // Calculate the difference in days + 1 to include both start and end date
      const days = differenceInDays(normalizedEndDate, normalizedStartDate) + 1;
      console.log('Days (normalized):', days);
      console.log('Start Date:', updatedFormData.start_date);
      console.log('End Date:', updatedFormData.end_date);
      if (days > 0) {
        // Calculate the standard amount for the selected period
        // Lấy số tiền chuẩn cho 1 ngày và nhân với số ngày
        // Ví dụ: Mỗi kỳ 30 ngày là 600.000, thì 1 ngày là 20.000, nếu chọn 2 ngày thì là 40.000 * 30 = 1.200.000
        let baseAmount;
        
        if (credit.interest_type === 'percentage') {
          // Số tiền lãi chuẩn cho 1 ngày
          const dailyInterestRate = credit.interest_value / 100 / 30; // Lãi suất hàng ngày
          
          // Công thức: Số tiền vay * lãi suất hàng ngày * số ngày * interest_period
          // Ví dụ: 20,000,000 * 0.03 / 30 * 2 * 30 = 1,200,000
          baseAmount = credit.loan_amount * dailyInterestRate * days * 30;
        } else {
          // Nếu là lãi suất cố định, tính tỷ lệ theo ngày
          const dailyAmount = credit.interest_value / credit.interest_period;
          baseAmount = dailyAmount * days * credit.interest_period;
        }
        
        // Calculate the new base amount and add the additional amount
        updatedFormData.expected_amount = Math.round(baseAmount) + 
          (updatedFormData.additional_amount || 0);
      }
    }
    
    // Clear any errors for this field
    if (errors[field]) {
      setErrors({
        ...errors,
        [field]: undefined
      });
    }
    
    // Update the form data with all the changes at once
    setFormData(updatedFormData);
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
    
    // Kiểm tra số tiền dự kiến đã được tính toán tự động
    if (formData.expected_amount <= 0) {
      newErrors.expected_amount = 'Khoảng thời gian quá ngắn, không tính được số tiền lãi';
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
                  defaultMonth={formData.start_date}
                  onSelect={(date) => handleDateChange('start_date', date)}
                  disabled={{
                    before: earliestUnpaidDate,
                  }}
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
                  defaultMonth={formData.end_date}
                  onSelect={(date) => handleDateChange('end_date', date)}
                  disabled={{
                    before: formData.start_date,
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.end_date && <p className="text-sm text-destructive">{errors.end_date}</p>}
          </div>
          
          {/* Số tiền dự kiến - Chỉ hiển thị, không cho phép nhập */}
          <div className="space-y-2">
            <Label htmlFor="expected_amount">Số tiền dự kiến <span className="text-destructive">*</span></Label>
            <div className="flex flex-col gap-2">
              <div className="p-2 border rounded-md w-full bg-muted-foreground/5 font-medium">
                {formData.expected_amount > 0 
                  ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(formData.expected_amount)
                  : calculatedBaseAmount > 0 
                    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculatedBaseAmount + (formData.additional_amount || 0))
                    : '0 ₫'}
              </div>
              
              {/* Chi tiết tính toán */}
              <div className="text-xs text-muted-foreground p-2 border rounded-md bg-muted/10">
                <div className="font-semibold mb-1">Cách tính:</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    {(() => {
                      // Normalize dates for accurate calendar day counting
                      if (!formData.start_date || !formData.end_date) {
                        return "Khoảng thời gian: Chưa xác định";
                      }
                      
                      const displayStartDate = new Date(
                        formData.start_date.getFullYear(),
                        formData.start_date.getMonth(),
                        formData.start_date.getDate()
                      );
                      const displayEndDate = new Date(
                        formData.end_date.getFullYear(),
                        formData.end_date.getMonth(),
                        formData.end_date.getDate()
                      );
                      
                      // Ensure days is never negative
                      const days = Math.max(0, differenceInDays(displayEndDate, displayStartDate) + 1);
                      return `Khoảng thời gian: ${days} ngày`;
                    })()} 
                  </li>
                  
                  {/* Tính toán số tiền cơ bản */}
                  <li className="font-medium">
                    Số tiền cơ bản: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculatedBaseAmount)}
                  </li>
                  <ul className="list-[circle] list-inside ml-4 text-[10px]">
                    {credit.interest_type === 'percentage' ? (
                      <>
                        <li>
                          Lãi suất: {credit.interest_value}% mỗi tháng (30 ngày)
                        </li>
                        <li>
                          Lãi suất hàng ngày: {credit.interest_value}% / 30 = {(credit.interest_value / 30).toFixed(4)}% mỗi ngày
                        </li>
                        <li>
                          Số tiền vay: {credit.loan_amount.toLocaleString('vi-VN')} đ
                        </li>
                        <li>
                          {(() => {
                            if (!formData.start_date || !formData.end_date) return "";
                            
                            const displayStartDate = new Date(
                              formData.start_date.getFullYear(),
                              formData.start_date.getMonth(),
                              formData.start_date.getDate()
                            );
                            const displayEndDate = new Date(
                              formData.end_date.getFullYear(),
                              formData.end_date.getMonth(),
                              formData.end_date.getDate()
                            );
                            
                            // Ensure days is never negative
                            const days = Math.max(0, differenceInDays(displayEndDate, displayStartDate) + 1);
                            return `Công thức: ${credit.loan_amount.toLocaleString('vi-VN')} × ${(credit.interest_value / 100 / 30).toFixed(6)} × ${days} ngày × 30`;
                          })()}
                        </li>
                      </>
                    ) : (
                      <>
                        <li>
                          Lãi suất cố định mỗi kỳ ({credit.interest_period} ngày): {credit.interest_value.toLocaleString('vi-VN')} đ
                        </li>
                        <li>
                          Số tiền mỗi ngày: {credit.interest_value.toLocaleString('vi-VN')} / {credit.interest_period} = {(credit.interest_value / credit.interest_period).toLocaleString('vi-VN')} đ/ngày
                        </li>
                        <li>
                          {(() => {
                            if (!formData.start_date || !formData.end_date) return "Số ngày đã chọn: 0 ngày";
                            
                            const displayStartDate = new Date(
                              formData.start_date.getFullYear(),
                              formData.start_date.getMonth(),
                              formData.start_date.getDate()
                            );
                            const displayEndDate = new Date(
                              formData.end_date.getFullYear(),
                              formData.end_date.getMonth(),
                              formData.end_date.getDate()
                            );
                            
                            // Ensure days is never negative
                            const days = Math.max(0, differenceInDays(displayEndDate, displayStartDate) + 1);
                            return `Số ngày đã chọn: ${days} ngày`;
                          })()} 
                        </li>
                        <li>
                          {(() => {
                            if (!formData.start_date || !formData.end_date) return "";
                            
                            const displayStartDate = new Date(
                              formData.start_date.getFullYear(),
                              formData.start_date.getMonth(),
                              formData.start_date.getDate()
                            );
                            const displayEndDate = new Date(
                              formData.end_date.getFullYear(),
                              formData.end_date.getMonth(),
                              formData.end_date.getDate()
                            );
                            
                            // Ensure days is never negative
                            const days = Math.max(0, differenceInDays(displayEndDate, displayStartDate) + 1);
                            return `Công thức: ${(credit.interest_value / credit.interest_period).toLocaleString('vi-VN')} × ${days} × ${credit.interest_period}`;
                          })()} 
                        </li>
                      </>
                    )}
                  </ul>
                  
                  {/* Số tiền thêm */}
                  <li className="font-medium">
                    Số tiền thêm: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(formData.additional_amount || 0)}
                  </li>
                  
                  {/* Tổng cộng */}
                  <li className="font-medium text-primary">
                    Tổng cộng: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(calculatedBaseAmount + (formData.additional_amount || 0))}
                  </li>
                </ul>
              </div>
            </div>
            {errors.expected_amount && <p className="text-sm text-destructive">{errors.expected_amount}</p>}
          </div>
          
          {/* Chỉ hiển thị trường actual_amount nếu đang chỉnh sửa */}
          {mode === 'edit' && (
            <div className="space-y-2">
              <Label htmlFor="actual_amount">Số tiền đã đóng</Label>
              <Input
                id="actual_amount"
                name="actual_amount"
                type="number"
                value={formData.actual_amount}
                onChange={handleChange}
                className={cn(errors.actual_amount && "border-destructive")}
                disabled={mode !== 'edit'}
              />
            </div>
          )}
          
          {/* Số tiền thêm */}
          <div className="space-y-2">
            <Label htmlFor="additional_amount">Số tiền thêm</Label>
            <Input
              id="additional_amount"
              name="additional_amount"
              type="number"
              value={formData.additional_amount}
              onChange={handleChange}
              placeholder="Nhập số tiền thêm (nếu có)"
            />
            <p className="text-xs text-muted-foreground">
              Số tiền thêm sẽ được cộng vào tổng số tiền dự kiến
            </p>
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
