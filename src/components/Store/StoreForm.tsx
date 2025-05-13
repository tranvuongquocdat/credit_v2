"use client";
import { useState, useEffect } from 'react';
import { Store, StoreFormData, StoreStatus } from '@/models/store';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

// Shadcn UI components
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface StoreFormProps {
  initialData?: Store | null;
  onSubmit: (data: StoreFormData) => Promise<void>;
  isSubmitting: boolean;
}

// Schema validation cho form
const formSchema = z.object({
  name: z.string().min(1, { message: "Tên cửa hàng không được để trống" }),
  address: z.string().min(1, { message: "Địa chỉ không được để trống" }),
  phone: z.string()
    .min(1, { message: "Số điện thoại không được để trống" })
    .regex(/^[0-9]{10,11}$/, { message: "Số điện thoại không hợp lệ" }),
  investment: z.coerce.number().min(0, { message: "Vốn đầu tư không được âm" }).optional(),
  cash_fund: z.coerce.number().min(0, { message: "Quỹ tiền mặt không được âm" }).optional(),
  status: z.nativeEnum(StoreStatus, {
    required_error: "Vui lòng chọn trạng thái"
  })
});

export default function StoreForm({ initialData, onSubmit, isSubmitting }: StoreFormProps) {
  // Format number to currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };
  
  // Sử dụng React Hook Form với Zod validation
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      phone: '',
      investment: 0,
      cash_fund: 0,
      status: StoreStatus.ACTIVE
    },
  });
  
  // Cập nhật giá trị form khi initialData thay đổi
  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        address: initialData.address || '',
        phone: initialData.phone || '',
        investment: initialData.investment || 0,
        cash_fund: initialData.cash_fund || 0,
        status: initialData.status || StoreStatus.ACTIVE
      });
    }
  }, [initialData, form]);
  
  // Xử lý submit form
  const handleFormSubmit = async (values: z.infer<typeof formSchema>) => {
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tên cửa hàng */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tên cửa hàng <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input
                    placeholder="Nhập tên cửa hàng"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Số điện thoại */}
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Số điện thoại <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input
                    placeholder="Nhập số điện thoại"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Địa chỉ */}
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Địa chỉ <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Nhập địa chỉ cửa hàng"
                    className="resize-none"
                    rows={2}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Vốn đầu tư */}
          <FormField
            control={form.control}
            name="investment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vốn đầu tư (VNĐ)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Nhập vốn đầu tư"
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : Number(e.target.value);
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                {field.value !== undefined && field.value > 0 && (
                  <p className="text-sm text-muted-foreground">{formatCurrency(field.value)}</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Quỹ tiền mặt */}
          <FormField
            control={form.control}
            name="cash_fund"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quỹ tiền mặt (VNĐ)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Nhập quỹ tiền mặt"
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : Number(e.target.value);
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                {field.value !== undefined && field.value > 0 && (
                  <p className="text-sm text-muted-foreground">{formatCurrency(field.value)}</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Trạng thái */}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trạng thái</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={StoreStatus.ACTIVE}>Hoạt động</SelectItem>
                    <SelectItem value={StoreStatus.SUSPENDED}>Tạm ngưng</SelectItem>
                    <SelectItem value={StoreStatus.INACTIVE}>Không hoạt động</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end mt-6 space-x-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang xử lý...
              </>
            ) : initialData ? 'Cập nhật' : 'Tạo cửa hàng'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
