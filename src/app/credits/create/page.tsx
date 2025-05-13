'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Card,
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { createCredit } from '@/lib/credit';
import { getCustomers } from '@/lib/customer';
import { getCurrentUser } from '@/lib/auth';
import { getAllActiveStores } from '@/lib/store';
import { Customer } from '@/models/customer';
import { CreateCreditParams, InterestType, CreditStatus } from '@/models/credit';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { cn } from '@/lib/utils';

// Validation schema cho form
const formSchema = z.object({
  customer_id: z.string().min(1, { message: 'Vui lòng chọn khách hàng' }),
  contract_code: z.string().optional(),
  id_number: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  collateral: z.string().optional(),
  loan_amount: z.coerce.number().positive({ message: 'Số tiền vay phải lớn hơn 0' }),
  interest_type: z.enum([InterestType.PERCENTAGE, InterestType.FIXED_AMOUNT], {
    message: 'Vui lòng chọn hình thức lãi'
  }),
  interest_value: z.coerce.number().positive({ message: 'Giá trị lãi phải lớn hơn 0' }),
  loan_period: z.coerce.number().positive({ message: 'Số ngày vay phải lớn hơn 0' }),
  interest_period: z.coerce.number().positive({ message: 'Kỳ lãi phí phải lớn hơn 0' }),
  loan_date: z.date({ required_error: 'Vui lòng chọn ngày vay' }),
  notes: z.string().optional(),
  status: z.enum([
    CreditStatus.ON_TIME,
    CreditStatus.OVERDUE,
    CreditStatus.LATE_INTEREST,
    CreditStatus.BAD_DEBT,
    CreditStatus.CLOSED,
    CreditStatus.DELETED
  ]).default(CreditStatus.ON_TIME).optional(),
  store_id: z.string().optional() // Có thể lấy từ context người dùng
});

export default function CreateCreditPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isLoadingStores, setIsLoadingStores] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contract_code: '',
      id_number: '',
      phone: '',
      address: '',
      collateral: '',
      loan_amount: 0,
      interest_type: InterestType.PERCENTAGE,
      interest_value: 0,
      loan_period: 30, // Mặc định 30 ngày
      interest_period: 10, // Mặc định 10 ngày đóng lãi 1 lần
      loan_date: new Date(),
      notes: '',
      status: CreditStatus.ON_TIME,
    },
  });

  // Lấy thông tin người dùng hiện tại
  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        setIsAdmin(user.role === 'admin');
      } catch (err) {
        console.error('Error loading current user:', err);
      }
    }
    
    loadCurrentUser();
  }, []);
  
  // Load danh sách khách hàng
  useEffect(() => {
    async function loadCustomers() {
      setIsLoadingCustomers(true);
      try {
        const { data, error } = await getCustomers(1, 1000); // Lấy tất cả khách hàng
        
        if (error) throw error;
        
        setCustomers(data);
      } catch (err) {
        console.error('Error loading customers:', err);
        setError('Có lỗi xảy ra khi tải danh sách khách hàng');
      } finally {
        setIsLoadingCustomers(false);
      }
    }
    
    loadCustomers();
  }, []);
  
  // Load danh sách cửa hàng (chỉ cho admin)
  useEffect(() => {
    async function loadStores() {
      if (!isAdmin) return;
      
      setIsLoadingStores(true);
      try {
        const { data, error } = await getAllActiveStores();
        
        if (error) throw error;
        
        setStores(data);
      } catch (err) {
        console.error('Error loading stores:', err);
      } finally {
        setIsLoadingStores(false);
      }
    }
    
    loadStores();
  }, [isAdmin]);

  // Xử lý khi form submit
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Chuẩn bị dữ liệu để tạo hợp đồng
      let creditData: CreateCreditParams;
      
      if (isAdmin) {
        // Admin chọn cửa hàng
        creditData = {
          ...values,
          store_id: values.store_id || '1', // Mặc định nếu không chọn
        };
      } else {
        // Người dùng thường: lấy store_id từ khách hàng được chọn
        const customerStoreId = selectedCustomer?.store_id;
        creditData = {
          ...values,
          store_id: customerStoreId || values.store_id || '1',
        };
      }
      
      // Gọi API tạo hợp đồng
      const { data, error } = await createCredit(creditData);
      
      if (error) throw error;
      
      // Chuyển hướng về trang danh sách hợp đồng
      router.push('/credits');
    } catch (err) {
      console.error('Error creating credit:', err);
      setError('Có lỗi xảy ra khi tạo hợp đồng. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };

  // Render form
  return (
    <Layout>
      <div className="container max-w-4xl mx-auto">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/credits')}
          className="mr-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Quay lại
        </Button>
        <h1 className="text-2xl font-semibold">Tạo hợp đồng tín chấp mới</h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Thông tin hợp đồng</CardTitle>
          <CardDescription>
            Vui lòng điền đầy đủ thông tin để tạo hợp đồng mới
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Chọn khách hàng */}
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Khách hàng <span className="text-red-500">*</span></FormLabel>
                      <Select 
                        disabled={isLoadingCustomers} 
                        onValueChange={(value) => {
                          // Cập nhật customer_id
                          field.onChange(value);
                          
                          // Tìm khách hàng được chọn để lấy store_id
                          const customer = customers.find(c => c.id === value);
                          if (customer) {
                            setSelectedCustomer(customer);
                            
                            // Nếu không phải admin, tự động cập nhật store_id từ khách hàng
                            if (!isAdmin && customer.store_id) {
                              form.setValue('store_id', customer.store_id);
                            }
                          }
                        }} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn khách hàng" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingCustomers ? (
                            <div className="flex items-center justify-center p-2">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              <span>Đang tải...</span>
                            </div>
                          ) : customers.length === 0 ? (
                            <div className="p-2 text-center">Không có khách hàng</div>
                          ) : (
                            customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name} {customer.phone ? `- ${customer.phone}` : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Khách hàng vay tín chấp
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Mã hợp đồng */}
                <FormField
                  control={form.control}
                  name="contract_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mã hợp đồng</FormLabel>
                      <FormControl>
                        <Input placeholder="Nhập mã hợp đồng" {...field} />
                      </FormControl>
                      <FormDescription>
                        Mã duy nhất của hợp đồng (nếu có)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Số CCCD */}
                <FormField
                  control={form.control}
                  name="id_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Số CCCD/CMND</FormLabel>
                      <FormControl>
                        <Input placeholder="Nhập số CCCD/CMND" {...field} />
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
                      <FormLabel>Số điện thoại</FormLabel>
                      <FormControl>
                        <Input placeholder="Nhập số điện thoại" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Ngày vay */}
                <FormField
                  control={form.control}
                  name="loan_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Ngày vay <span className="text-red-500">*</span></FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, 'dd/MM/yyyy', { locale: vi })
                              ) : (
                                <span>Chọn ngày vay</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Địa chỉ */}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Địa chỉ</FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập địa chỉ" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Tài sản thế chấp */}
                <FormField
                  control={form.control}
                  name="collateral"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tài sản thế chấp</FormLabel>
                      <FormControl>
                        <Input placeholder="Nhập thông tin tài sản thế chấp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Tổng tiền vay */}
                <FormField
                  control={form.control}
                  name="loan_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tổng tiền vay <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Nhập số tiền vay" 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Tổng số tiền khách hàng vay (VNĐ)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Hình thức lãi */}
                <FormField
                  control={form.control}
                  name="interest_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hình thức lãi <span className="text-red-500">*</span></FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn hình thức lãi" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={InterestType.PERCENTAGE}>Theo phần trăm (%)</SelectItem>
                          <SelectItem value={InterestType.FIXED_AMOUNT}>Theo số tiền cố định (VNĐ)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Giá trị lãi */}
                <FormField
                  control={form.control}
                  name="interest_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Giá trị lãi <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder={
                            form.watch('interest_type') === InterestType.PERCENTAGE 
                              ? "Nhập % lãi" 
                              : "Nhập số tiền lãi"
                          }
                          {...field} 
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        {form.watch('interest_type') === InterestType.PERCENTAGE 
                          ? "Phần trăm lãi suất (%)" 
                          : "Số tiền lãi cố định (VNĐ)"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Kỳ lãi phí */}
                <FormField
                  control={form.control}
                  name="interest_period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kỳ lãi phí <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Nhập số ngày của kỳ lãi" 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Số ngày cho mỗi kỳ đóng lãi
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Số ngày vay */}
                <FormField
                  control={form.control}
                  name="loan_period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Số ngày vay <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Nhập số ngày vay" 
                          {...field} 
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Tổng số ngày của khoản vay
                      </FormDescription>
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
                          <SelectItem value={CreditStatus.ON_TIME}>Đúng hẹn</SelectItem>
                          <SelectItem value={CreditStatus.OVERDUE}>Quá hạn</SelectItem>
                          <SelectItem value={CreditStatus.LATE_INTEREST}>Chậm lãi</SelectItem>
                          <SelectItem value={CreditStatus.BAD_DEBT}>Nợ xấu</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Ghi chú */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ghi chú</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Nhập ghi chú hoặc thông tin bổ sung khác"
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Lựa chọn cửa hàng (chỉ hiển thị với admin) */}
              {isAdmin && (
                <FormField
                  control={form.control}
                  name="store_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cửa hàng</FormLabel>
                      <Select
                        disabled={isLoadingStores}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn cửa hàng" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingStores ? (
                            <div className="flex items-center justify-center p-2">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              <span>Đang tải...</span>
                            </div>
                          ) : stores.length === 0 ? (
                            <div className="p-2 text-center">Không có cửa hàng</div>
                          ) : (
                            stores.map((store) => (
                              <SelectItem key={store.id} value={store.id}>
                                {store.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Cửa hàng quản lý hợp đồng
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <CardFooter className="flex justify-between px-0">
                <Button variant="outline" type="button" onClick={() => router.push('/credits')}>
                  Hủy
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Tạo hợp đồng
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
      </div>
    </Layout>
  );
}
