'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, UserCog, AlertCircle } from 'lucide-react';
import { Store } from '@/models/store';
import { Customer, UpdateCustomerParams, CustomerStatus } from '@/models/customer';
import { updateCustomer } from '@/lib/customer';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Separator } from '@/components/ui/separator';

// Schema cho form chỉnh sửa khách hàng
const customerFormSchema = z.object({
  name: z.string().min(1, { message: 'Tên khách hàng không được để trống' }),
  phone: z.string().optional(),
  address: z.string().optional(),
  id_number: z.string().optional(),
  email: z.string().email({ message: 'Email không hợp lệ' }).optional().or(z.literal('')),
  store_id: z.string().min(1, { message: 'Vui lòng chọn cửa hàng' }), 
  notes: z.string().optional(),
  status: z.nativeEnum(CustomerStatus),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

interface CustomerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customer: Customer | null;
  stores: Store[];
}

export function CustomerEditModal({
  isOpen,
  onClose,
  onSuccess,
  customer,
  stores
}: CustomerEditModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      id_number: '',
      email: '',
      store_id: '',
      notes: '',
      status: CustomerStatus.ACTIVE,
    },
  });

  // Cập nhật form khi customer thay đổi
  useEffect(() => {
    if (customer) {
      const defaultValues: Partial<CustomerFormValues> = {
        name: customer.name,
        phone: customer.phone || '',
        address: customer.address || '',
        id_number: customer.id_number || '',
        email: customer.email || '',
        store_id: customer.store_id || '',
        notes: customer.notes || '',
        status: customer.status || CustomerStatus.ACTIVE,
      };
      form.reset(defaultValues);
    }
  }, [customer, form]);

  // Đặt lại form khi đóng modal
  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async (values: CustomerFormValues) => {
    if (!customer) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const customerData: UpdateCustomerParams = {
        ...values,
      };
      
      const { data, error } = await updateCustomer(customer.id, customerData);
      
      if (error) throw new Error(error.toString());
      
      onSuccess();
    } catch (err: any) {
      console.error('Error updating customer:', err);
      setError(err.message || 'Có lỗi xảy ra khi cập nhật khách hàng. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center text-xl">
            <UserCog className="mr-2 h-5 w-5" />
            Chỉnh sửa khách hàng
          </DialogTitle>
        </DialogHeader>
        
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Lỗi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          <div>
            <h3 className="font-medium mb-2">Thông tin khách hàng</h3>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="name" className="text-right">
                Tên khách hàng <span className="text-red-500">*</span>
              </Label>
              <div>
                <Input 
                  id="name"
                  {...form.register("name")} 
                  placeholder="Nhập tên khách hàng" 
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center mt-4">
              <Label htmlFor="phone" className="text-right">Số điện thoại</Label>
              <div>
                <Input 
                  id="phone"
                  {...form.register("phone")} 
                  placeholder="Nhập số điện thoại" 
                />
                {form.formState.errors.phone && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.phone.message}</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center mt-4">
              <Label htmlFor="id_number" className="text-right">CCCD/CMND</Label>
              <div>
                <Input 
                  id="id_number"
                  {...form.register("id_number")} 
                  placeholder="Nhập số CCCD hoặc CMND" 
                />
                {form.formState.errors.id_number && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.id_number.message}</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center mt-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <div>
                <Input 
                  id="email"
                  type="email"
                  {...form.register("email")} 
                  placeholder="Nhập email" 
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="font-medium mb-2">Thông tin liên hệ</h3>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="address" className="text-right">Địa chỉ</Label>
              <div>
                <Input 
                  id="address"
                  {...form.register("address")} 
                  placeholder="Nhập địa chỉ" 
                />
                {form.formState.errors.address && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.address.message}</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center mt-4">
              <Label htmlFor="store_id" className="text-right">
                Cửa hàng <span className="text-red-500">*</span>
              </Label>
              <div>
                <Select 
                  onValueChange={(value) => form.setValue("store_id", value)} 
                  defaultValue={form.getValues().store_id}
                >
                  <SelectTrigger id="store_id">
                    <SelectValue placeholder="Chọn cửa hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Cửa hàng của khách hàng</p>
                {form.formState.errors.store_id && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.store_id.message}</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center mt-4">
              <Label htmlFor="notes" className="text-right">Ghi chú</Label>
              <div>
                <Input 
                  id="notes"
                  {...form.register("notes")} 
                  placeholder="Ghi chú thêm về khách hàng" 
                />
                {form.formState.errors.notes && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.notes.message}</p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center mt-4">
              <Label htmlFor="status" className="text-right">Trạng thái</Label>
              <div>
                <Select 
                  onValueChange={(value) => form.setValue("status", value as CustomerStatus)} 
                  defaultValue={customer?.status || CustomerStatus.ACTIVE}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CustomerStatus.ACTIVE}>Hoạt động</SelectItem>
                    <SelectItem value={CustomerStatus.INACTIVE}>Không hoạt động</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.status && (
                  <p className="text-sm text-red-500 mt-1">{form.formState.errors.status.message}</p>
                )}
              </div>
            </div>
          </div>
            
            <DialogFooter className="pt-4">
              <Button variant="outline" type="button" onClick={handleClose}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-1">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Lưu thay đổi
              </Button>
            </DialogFooter>
          </form>
      </DialogContent>
    </Dialog>
  );
}