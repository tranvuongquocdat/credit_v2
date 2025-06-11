"use client";
import { useEffect } from 'react';
import { Store, StoreFormData } from '@/models/store';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

// Shadcn UI components
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface StoreFormProps {
  initialData?: Store | null;
  onSubmit: (data: StoreFormData) => Promise<void>;
  isSubmitting: boolean;
  hideButtons?: boolean;
  onClose: () => void;
}

// Schema validation cho form
const formSchema = z.object({
  name: z.string()
    .min(1, { message: "Tên cửa hàng không được để trống" })
    .max(100, { message: "Tên cửa hàng không được quá 100 ký tự" }),
  address: z.string()
    .min(1, { message: "Địa chỉ không được để trống" })
    .max(255, { message: "Địa chỉ không được quá 255 ký tự" }),
  phone: z.string()
    .min(1, { message: "Số điện thoại không được để trống" })
    .regex(/^[0-9]{10,11}$/, { message: "Số điện thoại phải có 10-11 chữ số" }),
});

export default function StoreForm({ initialData, onSubmit, isSubmitting, hideButtons = false, onClose }: StoreFormProps) {
  // Sử dụng React Hook Form với Zod validation
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      phone: '',
    },
  });
  
  // Cập nhật giá trị form khi initialData thay đổi
  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || '',
        address: initialData.address || '',
        phone: initialData.phone || '',
      });
    } else {
      // Reset form khi không có initialData (tạo mới)
      form.reset({
        name: '',
        address: '',
        phone: '',
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
        </div>

        {!hideButtons && (
          <div className="flex justify-end mt-6 space-x-3">
            <Button variant="outline" type="button" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : initialData ? 'Cập nhật' : 'Tạo cửa hàng'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
