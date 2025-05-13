'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { 
  createCustomer, 
  updateCustomer, 
  deleteCustomer, 
  getCustomers
} from '@/lib/customer';
import { getAllActiveStores } from '@/lib/store';
import { Customer, CreateCustomerParams, UpdateCustomerParams } from '@/models/customer';
import { Store } from '@/models/store';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '@/components/ui/pagination';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { MoreVertical, PlusIcon, RefreshCw, FileEditIcon, Trash2Icon, SearchIcon, UsersIcon, CreditCardIcon } from 'lucide-react';

// Schema cho form thêm/sửa khách hàng
const customerFormSchema = z.object({
  name: z.string().min(1, { message: 'Tên khách hàng không được để trống' }),
  phone: z.string().optional(),
  address: z.string().optional(),
  id_number: z.string().optional(),
  store_id: z.string().optional(), // Có thể lấy từ context người dùng
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

export default function CustomersPage() {
  const router = useRouter();
  
  // State cho phân trang và tìm kiếm
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  
  // State cho dữ liệu và loading
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State cho dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State cho danh sách cửa hàng
  const [stores, setStores] = useState<Store[]>([]);
  
  // Form cho thêm khách hàng mới
  const addForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      id_number: '',
    },
  });
  
  // Form cho chỉnh sửa khách hàng
  const editForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      id_number: '',
    },
  });
  
  // Tải danh sách khách hàng
  useEffect(() => {
    async function loadCustomers() {
      setIsLoading(true);
      setError(null);
      
      try {
        const { data, total, error } = await getCustomers(
          currentPage,
          pageSize,
          searchQuery
        );
        
        if (error) throw error;
        
        setCustomers(data);
        setTotalCustomers(total);
      } catch (err) {
        console.error('Error loading customers:', err);
        setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadCustomers();
  }, [currentPage, pageSize, searchQuery]);
  
  // Lấy danh sách cửa hàng cho dropdown
  useEffect(() => {
    async function fetchStores() {
      try {
        const { data, error } = await getAllActiveStores();
        if (error) throw error;
        setStores(data || []);
      } catch (err) {
        console.error('Error fetching stores:', err);
      }
    }
    
    fetchStores();
  }, []);
  
  // Xử lý khi thay đổi tìm kiếm
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset về trang 1 khi tìm kiếm
  };
  
  // Xử lý khi thay đổi trang
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Xử lý thêm khách hàng mới
  const handleAddCustomer = async (values: CustomerFormValues) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const customerData: CreateCustomerParams = {
        ...values,
        store_id: values.store_id || '1', // Giả sử store_id mặc định là '1'
      };
      
      const { data, error } = await createCustomer(customerData);
      
      if (error) throw error;
      
      // Refresh danh sách khách hàng
      const { data: refreshedData, total, error: refreshError } = await getCustomers(
        currentPage,
        pageSize,
        searchQuery
      );
      
      if (refreshError) throw refreshError;
      
      setCustomers(refreshedData);
      setTotalCustomers(total);
      setIsAddDialogOpen(false);
      addForm.reset();
    } catch (err) {
      console.error('Error adding customer:', err);
      setError('Có lỗi xảy ra khi thêm khách hàng. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Xử lý chỉnh sửa khách hàng
  const handleEditCustomer = async (values: CustomerFormValues) => {
    if (!selectedCustomer) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const customerData: UpdateCustomerParams = {
        ...values,
      };
      
      const { data, error } = await updateCustomer(selectedCustomer.id, customerData);
      
      if (error) throw error;
      
      // Refresh danh sách khách hàng
      const { data: refreshedData, total, error: refreshError } = await getCustomers(
        currentPage,
        pageSize,
        searchQuery
      );
      
      if (refreshError) throw refreshError;
      
      setCustomers(refreshedData);
      setTotalCustomers(total);
      setIsEditDialogOpen(false);
    } catch (err) {
      console.error('Error editing customer:', err);
      setError('Có lỗi xảy ra khi cập nhật khách hàng. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Xử lý xóa khách hàng
  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const { success, error } = await deleteCustomer(selectedCustomer.id);
      
      if (error) throw error;
      
      if (!success) {
        throw new Error('Không thể xóa khách hàng vì đã có hợp đồng liên quan');
      }
      
      // Refresh danh sách khách hàng
      const { data: refreshedData, total, error: refreshError } = await getCustomers(
        currentPage,
        pageSize,
        searchQuery
      );
      
      if (refreshError) throw refreshError;
      
      setCustomers(refreshedData);
      setTotalCustomers(total);
      setIsDeleteDialogOpen(false);
    } catch (err: any) {
      console.error('Error deleting customer:', err);
      setError(err.message || 'Có lỗi xảy ra khi xóa khách hàng. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Xử lý mở dialog chỉnh sửa
  const handleOpenEditDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    editForm.reset({
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      id_number: customer.id_number || '',
      store_id: customer.store_id || '',
    });
    setIsEditDialogOpen(true);
  };
  
  // Xử lý mở dialog xóa
  const handleOpenDeleteDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDeleteDialogOpen(true);
  };
  
  // Tính toán tổng số trang
  const totalPages = Math.ceil(totalCustomers / pageSize);
  
  // Xem danh sách hợp đồng của khách hàng
  const viewCustomerCredits = (customerId: string) => {
    router.push(`/credits?customer_id=${customerId}`);
  };

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Quản lý khách hàng</CardTitle>
              <CardDescription>Tổng cộng {totalCustomers} khách hàng</CardDescription>
            </div>
            <Button onClick={() => {
              addForm.reset();
              setIsAddDialogOpen(true);
            }}>
              <PlusIcon className="mr-2 h-4 w-4" /> Thêm khách hàng
            </Button>
          </CardHeader>
          <CardContent>
          {/* Thanh tìm kiếm */}
          <div className="flex items-center space-x-2 mb-6">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Tìm kiếm khách hàng..."
                className="w-full pl-8"
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => getCustomers()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Hiển thị lỗi nếu có */}
          {error && (
            <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Danh sách khách hàng */}
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <RefreshCw className="animate-spin h-8 w-8 text-gray-400" />
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center text-gray-500 my-8">
              Không tìm thấy khách hàng nào
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Địa chỉ</TableHead>
                    <TableHead>Số điện thoại</TableHead>
                    <TableHead>Số CCCD/CMND</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="font-medium">{customer.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{customer.address || '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{customer.phone || '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{customer.id_number || '-'}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => viewCustomerCredits(customer.id)}>
                              <CreditCardIcon className="mr-2 h-4 w-4" />
                              Xem hợp đồng
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenEditDialog(customer)}>
                              <FileEditIcon className="mr-2 h-4 w-4" />
                              Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenDeleteDialog(customer)}>
                              <Trash2Icon className="mr-2 h-4 w-4" />
                              Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Phân trang */}
          {totalPages > 0 && (
            <div className="mt-6 flex justify-center">
              <Pagination>
                <PaginationContent>
                  {currentPage > 1 && (
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(currentPage - 1);
                        }}
                      />
                    </PaginationItem>
                  )}
                  
                  {Array.from({ length: totalPages }, (_, i) => (
                    <PaginationItem key={i + 1}>
                      <PaginationLink
                        href="#"
                        isActive={currentPage === i + 1}
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(i + 1);
                        }}
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  
                  {currentPage < totalPages && (
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(currentPage + 1);
                        }}
                      />
                    </PaginationItem>
                  )}
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Dialog thêm khách hàng mới */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm khách hàng mới</DialogTitle>
            <DialogDescription>
              Điền thông tin khách hàng mới vào biểu mẫu dưới đây.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(handleAddCustomer)} className="space-y-4">
              <FormField
                control={addForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên khách hàng <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên khách hàng" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={addForm.control}
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
              
              <FormField
                control={addForm.control}
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
              
              <FormField
                control={addForm.control}
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
              
              <FormField
                control={addForm.control}
                name="store_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cửa hàng</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn cửa hàng" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsAddDialogOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Thêm
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog chỉnh sửa khách hàng */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa thông tin khách hàng</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin khách hàng.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditCustomer)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên khách hàng <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên khách hàng" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
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
              
              <FormField
                control={editForm.control}
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
              
              <FormField
                control={editForm.control}
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
              
              <FormField
                control={editForm.control}
                name="store_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cửa hàng</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn cửa hàng" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsEditDialogOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Cập nhật
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Dialog xác nhận xóa */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa khách hàng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa khách hàng {selectedCustomer?.name}? 
              Hành động này không thể hoàn tác.
              <br /><br />
              <strong className="text-red-600">Lưu ý:</strong> Chỉ có thể xóa khách hàng chưa liên kết với bất kỳ hợp đồng nào.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustomer}
              disabled={isSubmitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Layout>
  );
}
