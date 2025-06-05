"use client";

import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { Plus, Pencil, Trash2, RefreshCw, MoreVertical, FilterIcon, CalendarIcon, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

// Shadcn UI components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@/components/ui/pagination";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";
import { MoneyInput } from "@/components/ui/money-input";

// Define transaction types
const TRANSACTION_TYPES = {
  INCOME_OTHER: "thu_khac",
  INCOME_FUND: "thu_tra_quy",
  INCOME_DEBT: "thu_tien_no",
  INCOME_ADVANCE: "thu_tien_ung",
  INCOME_PENALTY: "thu_tien_phat",
  INCOME_COMMISSION: "hoa_hong_thu",
  INCOME_TICKET: "thu_ve",
} as const;

// Transaction type display information
const transactionTypeMap = {
  [TRANSACTION_TYPES.INCOME_OTHER]: {
    label: "Thu khác",
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  },
  [TRANSACTION_TYPES.INCOME_FUND]: {
    label: "Thu trả quỹ",
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  },
  [TRANSACTION_TYPES.INCOME_DEBT]: {
    label: "Thu tiền nợ",
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  },
  [TRANSACTION_TYPES.INCOME_ADVANCE]: {
    label: "Thu tiền ứng",
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  },
  [TRANSACTION_TYPES.INCOME_PENALTY]: {
    label: "Thu tiền phạt",
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  },
  [TRANSACTION_TYPES.INCOME_COMMISSION]: {
    label: "Hoa hồng",
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  },
  [TRANSACTION_TYPES.INCOME_TICKET]: {
    label: "Thu vé",
    color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
  },
};

// Transaction form data type
type TransactionFormData = {
  receiver: string; // Tên người nộp tiền (hiển thị)
  customer_id: string; // ID của khách hàng (lưu vào DB)
  amount: number;
  formattedAmount: string; // Số tiền đã định dạng
  transaction_type: string;
  description: string;
};

// Transaction type from Supabase
type Transaction = {
  id: string;
  created_at: string;
  employee_id: string | null;
  update_at: string | null;
  customer_id: string | null;
  customer_name?: string; // Thêm trường này để lưu tên khách hàng
  transaction_type: string | null;
  debit_amount: number | null;
  credit_amount: number | null;
  description: string | null;
};

// Customer type
type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  id_number: string | null;
};

export default function IncomePage() {
  // Get current store from context
  const { currentStore } = useStore();
  const router = useRouter();

  // Helper function to handle error messages
  const getErrorMessage = (error: any): string => {
    if (typeof error === 'object' && error !== null) {
      return error.message || String(error);
    }
    return String(error);
  };

  // State for pagination and search
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // State for filters
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>('all');

  // State for data and loading
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for dialogs
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<Transaction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for customers
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('existing');
  
  // Form state
  const [formData, setFormData] = useState<TransactionFormData>({
    receiver: '',
    customer_id: '',
    amount: 0,
    formattedAmount: '',
    transaction_type: TRANSACTION_TYPES.INCOME_OTHER,
    description: '',
  });
  
  // Thêm state cho khách hàng mới
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerIdNumber, setNewCustomerIdNumber] = useState('');

  // Format currency
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'HH:mm dd/MM/yyyy');
    } catch (e) {
      return dateString;
    }
  };

  // Load customers
  useEffect(() => {
    const loadCustomers = async () => {
      setIsLoadingCustomers(true);
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, name, phone, address, id_number')
          .order('name');
          
        if (error) throw error;
        
        setCustomers(data || []);
      } catch (err) {
        console.error('Error loading customers:', err);
        setError(getErrorMessage(err));
      } finally {
        setIsLoadingCustomers(false);
      }
    };
    
    loadCustomers();
  }, []);

  // Load transactions with customer names
  const fetchTransactions = async () => {
    if (!currentStore?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // First, get transactions
      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .or(`transaction_type.eq.${TRANSACTION_TYPES.INCOME_OTHER},transaction_type.eq.${TRANSACTION_TYPES.INCOME_FUND},transaction_type.eq.${TRANSACTION_TYPES.INCOME_DEBT},transaction_type.eq.${TRANSACTION_TYPES.INCOME_ADVANCE},transaction_type.eq.${TRANSACTION_TYPES.INCOME_PENALTY},transaction_type.eq.${TRANSACTION_TYPES.INCOME_COMMISSION},transaction_type.eq.${TRANSACTION_TYPES.INCOME_TICKET}`)
        .order('created_at', { ascending: false });

      // Apply date range filter if provided
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }

      if (dateTo) {
        // Add one day to include the end date
        const nextDay = new Date(dateTo);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('created_at', nextDay.toISOString());
      }

      // Apply transaction type filter if provided
      if (transactionTypeFilter && transactionTypeFilter !== 'all') {
        query = query.eq('transaction_type', transactionTypeFilter);
      }

      // Apply store filter
      if (currentStore?.id) {
        query = query.eq('store_id', currentStore.id);
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data: transactionData, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;
      
      // Get customer information for all transactions
      const transactionsWithCustomerInfo = await Promise.all(
        (transactionData || []).map(async (transaction) => {
          if (!transaction.customer_id) return { ...transaction, customer_name: '-' };
          
          // Find customer in our loaded customers list
          const customer = customers.find(c => c.id === transaction.customer_id);
          if (customer) {
            return { ...transaction, customer_name: customer.name };
          }
          
          // If not found in our list, try to fetch from DB
          try {
            const { data: customerData } = await supabase
              .from('customers')
              .select('name')
              .eq('id', transaction.customer_id)
              .single();
              
            return { 
              ...transaction, 
              customer_name: customerData?.name || transaction.customer_id 
            };
          } catch (err) {
            return { ...transaction, customer_name: transaction.customer_id };
          }
        })
      );

      setTransactions(transactionsWithCustomerInfo as Transaction[]);
      setTotalRecords(count || 0);
      setTotalPages(count ? Math.ceil(count / pageSize) : 0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to load transactions when component mounts and when filters change
  useEffect(() => {
    if (currentStore?.id) {
      fetchTransactions();
    }
  }, [currentStore?.id, currentPage, pageSize, dateFrom, dateTo, transactionTypeFilter]);

  // Handle search
  const handleSearch = () => {
    setCurrentPage(1); // Reset to page 1 when searching
    fetchTransactions();
  };

  // Reset filters
  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTransactionTypeFilter('all');
    setCurrentPage(1);
  };

  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    // Convert to number and back to string to remove non-numeric characters
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    // Format with thousand separators
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  
  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    setFormData(prev => ({
      ...prev,
      amount: Number(rawValue),
      formattedAmount: formatNumber(rawValue)
    }));
  };
  
  // Form change handler
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'amount') {
      handleAmountChange(e as React.ChangeEvent<HTMLInputElement>);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle customer selection change
  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const customerId = e.target.value;
    const customer = customers.find(c => c.id === customerId);
    
    setFormData(prev => ({
      ...prev,
      customer_id: customerId,
      receiver: customer?.name || ''
    }));
  };

  // Handle adding new transaction
  const handleAddTransaction = async () => {
    setIsSubmitting(true);

    try {
      // Xử lý khách hàng mới nếu cần
      let finalCustomerId = formData.customer_id;
      
      if (customerType === 'new') {
        if (!newCustomerName.trim()) {
          throw new Error('Vui lòng nhập tên khách hàng');
        }
        
        // Tạo khách hàng mới
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            name: newCustomerName,
            store_id: currentStore?.id,
            phone: newCustomerPhone,
            address: newCustomerAddress,
            id_number: newCustomerIdNumber
          })
          .select()
          .single();
        
        if (customerError) {
          throw new Error(`Không thể tạo khách hàng mới: ${customerError instanceof Error ? customerError.message : JSON.stringify(customerError)}`);
        }
        
        if (!newCustomer?.id) {
          throw new Error('Không thể tạo khách hàng mới');
        }
        
        // Sử dụng ID của khách hàng mới tạo
        finalCustomerId = newCustomer.id;
        
        // Cập nhật danh sách khách hàng
        setCustomers(prev => [...prev, newCustomer as Customer]);
      } else if (!finalCustomerId) {
        throw new Error('Vui lòng chọn khách hàng');
      }

      const newTransaction = {
        transaction_type: formData.transaction_type,
        description: formData.description,
        credit_amount: formData.amount,
        debit_amount: 0,
        employee_id: null, // Sẽ được điền bởi RLS nếu cần
        store_id: currentStore?.id,
        customer_id: finalCustomerId, // Sử dụng customer_id đã chọn hoặc mới tạo
      };

      const { error: createError } = await supabase
        .from('transactions')
        .insert([newTransaction]);

      if (createError) throw createError;

      setIsFormModalOpen(false);
      fetchTransactions();
      
      // Reset form data
      resetFormData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle updating transaction
  const handleUpdateTransaction = async () => {
    if (!selectedRecord) return;
    setIsSubmitting(true);

    try {
      const updatedTransaction = {
        transaction_type: formData.transaction_type,
        description: formData.description,
        credit_amount: formData.amount,
        debit_amount: 0,
        update_at: new Date().toISOString(),
        customer_id: formData.customer_id || null, // Sử dụng customer_id đã chọn
      };

      const { error: updateError } = await supabase
        .from('transactions')
        .update(updatedTransaction)
        .eq('id', selectedRecord.id);

      if (updateError) throw updateError;

      setIsFormModalOpen(false);
      setSelectedRecord(null);
      fetchTransactions();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle deleting transaction
  const handleDeleteTransaction = async () => {
    if (!selectedRecord) return;
    setIsSubmitting(true);

    try {
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', selectedRecord.id);

      if (deleteError) throw deleteError;

      setIsDeleteModalOpen(false);
      setSelectedRecord(null);
      fetchTransactions();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit modal
  const openEditModal = (record: Transaction) => {
    setSelectedRecord(record);
    
    // Find customer name if available
    const customerName = record.customer_name || 
      customers.find(c => c.id === record.customer_id)?.name || 
      '';
    
    setFormData({
      receiver: customerName,
      customer_id: record.customer_id || '',
      amount: record.credit_amount || 0,
      formattedAmount: formatNumber(record.credit_amount || 0),
      transaction_type: record.transaction_type || TRANSACTION_TYPES.INCOME_OTHER,
      description: record.description || '',
    });
    setIsFormModalOpen(true);
  };

  // Open delete modal
  const openDeleteModal = (record: Transaction) => {
    setSelectedRecord(record);
    setIsDeleteModalOpen(true);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Get page numbers for pagination
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return pageNumbers;
  };

  // Render pagination
  const renderPagination = () => {
    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              onClick={() => handlePageChange(currentPage - 1)}
              className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>
          
          {getPageNumbers().map(page => (
            <PaginationItem key={page}>
              <PaginationLink 
                onClick={() => handlePageChange(page)}
                isActive={currentPage === page}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}
          
          <PaginationItem>
            <PaginationNext 
              onClick={() => handlePageChange(currentPage + 1)}
              className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  // Tính tổng số tiền
  const calculateTotal = () => {
    return transactions.reduce((acc, record) => {
      return acc + (record.credit_amount || 0);
    }, 0);
  };

  // Reset form data
  const resetFormData = () => {
    setFormData({
      receiver: '',
      customer_id: '',
      amount: 0,
      formattedAmount: '',
      transaction_type: TRANSACTION_TYPES.INCOME_OTHER,
      description: '',
    });
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerAddress('');
    setNewCustomerIdNumber('');
    setCustomerType('existing');
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800">Phiếu thu: {currentStore?.name || ''}</h1>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('vi-VN', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric'
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div>
              <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700 mb-1">
                Từ Ngày
              </label>
              <div className="relative">
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <CalendarIcon className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700 mb-1">
                Đến Ngày
              </label>
              <div className="relative">
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <CalendarIcon className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="transactionType" className="block text-sm font-medium text-gray-700 mb-1">
                Loại phiếu
              </label>
              <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                <SelectTrigger id="transactionType" className="w-full">
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {Object.entries(TRANSACTION_TYPES).map(([key, value]) => (
                    <SelectItem key={value} value={value}>
                      {transactionTypeMap[value as keyof typeof transactionTypeMap]?.label || value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between gap-2 mb-4">
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setSelectedRecord(null);
                  setFormData({
                    receiver: '',
                    customer_id: '',
                    amount: 0,
                    formattedAmount: '',
                    transaction_type: TRANSACTION_TYPES.INCOME_OTHER,
                    description: '',
                  });
                  setIsFormModalOpen(true);
                }}
                size="sm"
                className="text-white bg-green-600 hover:bg-green-700"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Tạo phiếu thu
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="bg-gray-100"
                onClick={handleResetFilters}
              >
                Đặt lại bộ lọc
              </Button>
              <Button 
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSearch}
              >
                <FilterIcon className="mr-1 h-3.5 w-3.5" />
                Tìm
              </Button>
            </div>
          </div>
        </div>
        
        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}
        
        {/* Transactions table */}
        <div className="rounded-md border mt-4 mb-1 border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 text-center flex justify-center items-center">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Đang tải...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              Không tìm thấy giao dịch nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="border-collapse">
                <TableHeader className="bg-gray-50 border-b">
                  <TableRow>
                    <TableHead className="py-2 px-3 text-left font-medium w-12 border-b border-r border-gray-200">STT</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Ngày</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Nhân viên</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Khách hàng</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Loại phiếu</TableHead>
                    <TableHead className="py-2 px-3 text-right font-medium border-b border-r border-gray-200">Số tiền</TableHead>
                    <TableHead className="py-2 px-3 text-left font-medium border-b border-r border-gray-200">Ghi chú</TableHead>
                    <TableHead className="py-2 px-3 text-center font-medium w-24 border-b border-gray-200">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((record, index) => (
                    <TableRow key={record.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell className="py-3 px-3 text-gray-500 border-b border-r border-gray-200">
                        {(currentPage - 1) * pageSize + index + 1}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        {formatDate(record.created_at)}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        {record.employee_id || '-'}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        {record.customer_name || record.customer_id || '-'}
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <Badge 
                          className={record.transaction_type ? 
                            transactionTypeMap[record.transaction_type as keyof typeof transactionTypeMap]?.color || '' : ''}
                          variant="outline"
                        >
                          {record.transaction_type ? 
                            transactionTypeMap[record.transaction_type as keyof typeof transactionTypeMap]?.label || 
                            record.transaction_type : 'Không xác định'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right font-medium border-b border-r border-gray-200">
                        <span className="text-green-600">
                          +{formatCurrency(record.credit_amount)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-r border-gray-200">
                        <div className="text-sm">{record.description || '-'}</div>
                      </TableCell>
                      <TableCell className="py-3 px-3 border-b border-gray-200">
                        <div className="flex justify-center space-x-1">
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            onClick={() => openEditModal(record)}
                          >
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0" 
                            onClick={() => openDeleteModal(record)}
                          >
                            <Trash2 className="h-4 w-4 text-gray-500" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Mở menu</span>
                                <MoreVertical className="h-4 w-4 text-gray-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEditModal(record)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Sửa thông tin
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Printer className="mr-2 h-4 w-4" />
                                In phiếu
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openDeleteModal(record)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Xóa giao dịch
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Hàng tổng cộng */}
                  {transactions.length > 0 && (
                    <TableRow className="bg-gray-50 font-medium">
                      <TableCell colSpan={5} className="py-3 px-3 text-right border-b border-r border-t border-gray-200">
                        Tổng
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right font-semibold border-b border-r border-t border-gray-200">
                        <span className="text-green-600">
                          +{formatCurrency(calculateTotal())}
                        </span>
                      </TableCell>
                      <TableCell colSpan={2} className="py-3 px-3 border-b border-t border-gray-200"></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        
        {/* Pagination */}
        <div className="mt-4">
          {!isLoading && transactions.length > 0 && renderPagination()}
        </div>
        
        {/* Transaction Form Modal */}
        <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{selectedRecord ? 'Chỉnh sửa phiếu thu' : 'Tạo phiếu thu mới'}</DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              {!selectedRecord && (
                <div className="flex justify-center mb-2">
                  <div className="flex space-x-8">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="existing-customer"
                        name="customerType"
                        value="existing"
                        checked={customerType === 'existing'}
                        onChange={() => setCustomerType('existing')}
                        className="mr-2"
                      />
                      <Label htmlFor="existing-customer">Khách hàng đã có</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="new-customer"
                        name="customerType"
                        value="new"
                        checked={customerType === 'new'}
                        onChange={() => setCustomerType('new')}
                        className="mr-2"
                      />
                      <Label htmlFor="new-customer">Khách hàng mới</Label>
                    </div>
                  </div>
                </div>
              )}
              
              {customerType === 'existing' ? (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="customer_id" className="text-right">
                    Người nộp tiền
                  </Label>
                  <select
                    id="customer_id"
                    name="customer_id"
                    className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                    value={formData.customer_id}
                    onChange={handleCustomerChange}
                    disabled={!!selectedRecord}
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="newCustomerName" className="text-right">
                      Tên khách hàng <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="newCustomerName"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="col-span-3"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="newCustomerPhone" className="text-right">
                      Số điện thoại
                    </Label>
                    <Input
                      id="newCustomerPhone"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="newCustomerIdNumber" className="text-right">
                      Số CCCD/Hộ chiếu
                    </Label>
                    <Input
                      id="newCustomerIdNumber"
                      value={newCustomerIdNumber}
                      onChange={(e) => setNewCustomerIdNumber(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="newCustomerAddress" className="text-right">
                      Địa chỉ
                    </Label>
                    <Input
                      id="newCustomerAddress"
                      value={newCustomerAddress}
                      onChange={(e) => setNewCustomerAddress(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                </>
              )}
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="amount" className="text-right">
                  Số tiền
                </Label>
                <div className="col-span-3">
                  <MoneyInput
                    id="amount"
                    name="amount"
                    value={formData.amount}
                    onChange={(e) => {
                      const numericValue = parseInt(e.target.value) || 0;
                      setFormData(prev => ({
                        ...prev,
                        amount: numericValue,
                        formattedAmount: formatNumber(numericValue)
                      }));
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="transaction_type" className="text-right">
                  Loại phiếu
                </Label>
                <Select 
                  name="transaction_type"
                  value={formData.transaction_type} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, transaction_type: value }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Chọn loại phiếu" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRANSACTION_TYPES).map(([key, value]) => (
                      <SelectItem key={value} value={value}>
                        {transactionTypeMap[value as keyof typeof transactionTypeMap]?.label || value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">
                  Lý do thu tiền
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  className="col-span-3"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={3}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={selectedRecord ? handleUpdateTransaction : handleAddTransaction}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                {selectedRecord ? 'Cập nhật' : 'Tạo phiếu thu'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa giao dịch này?
                <br />
                Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Hủy bỏ</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTransaction} 
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
