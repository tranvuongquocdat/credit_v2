import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { PlusIcon, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { useCustomerSearch } from '@/hooks/useCustomers';
import { Customer } from '@/models/customer';
import { useStore } from '@/contexts/StoreContext';
import { CreditStatus } from '@/models/credit';

interface SearchFiltersProps {
  onSearch: (filters: SearchFilters) => void;
  onReset: () => void;
  onCreateNew: () => void;
  onExportExcel: () => void;
  exporting?: boolean;
  initialFilters?: Partial<SearchFilters>;
  itemsPerPage: number;
  onPageSizeChange: (pageSize: number) => void;
}

export interface SearchFilters {
  contract_code: string;
  customer_name: string;
  start_date: string;
  end_date: string;
  duration?: number;
  status: string;
  store_id?: string;
}

export function SearchFilters({ 
  onSearch, 
  onReset, 
  onCreateNew, 
  onExportExcel,
  exporting,
  initialFilters,
  itemsPerPage,
  onPageSizeChange 
}: SearchFiltersProps) {
  const statusMap: Record<string, { label: string; color: string }> = {
    // Map filter values to display labels
    'on_time': { label: 'Đang vay', color: 'bg-green-100 text-green-800' },
    'late_interest': { label: 'Chậm lãi', color: 'bg-yellow-100 text-yellow-800' },
    'overdue': { label: 'Quá hạn', color: 'bg-red-100 text-red-800' },
    'closed': { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800' },
    'deleted': { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' },
    'due_tomorrow': { label: 'Ngày mai đóng lãi', color: 'bg-amber-100 text-amber-800' },
  };
  const [filters, setFilters] = useState<SearchFilters>({
    contract_code: '',
    customer_name: '',
    start_date: '',
    end_date: '',
    status: 'on_time',
    duration: undefined
  });
  const { hasPermission } = usePermissions();
  const { currentStore } = useStore();
  
  // Kiểm tra quyền tạo hợp đồng tín chấp
  const canCreateCredit = hasPermission('tao_moi_hop_dong_tin_chap');
  
  // State for customer autocomplete
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Debounce customer name để tránh gọi API liên tục khi nhập nhanh
  const debouncedCustomerName = useDebounce(filters.customer_name, 300);

  // Use React Query for customer search with caching
  const { data: customerSearchData, isLoading: customersLoading } = useCustomerSearch(
    debouncedCustomerName,
    debouncedCustomerName.length > 0 // Only enable search when we have input
  );

  // Extract customers from search results
  const customers = customerSearchData?.data || [];
  const filteredCustomers = customers;

  // Debounced customer search for autocomplete
  useEffect(() => {
    if (debouncedCustomerName.trim() === '') {
      setShowCustomerDropdown(false);
    } else {
      // Show dropdown if we have search results and they're not loading
      setShowCustomerDropdown(!customersLoading && customers.length > 0);
    }
  }, [debouncedCustomerName, customers, customersLoading]);

  // Auto-search when debounced customer name changes
  useEffect(() => {
    // Only trigger search if we have current store
    if (currentStore?.id) {
      const newFilters = {
        ...filters,
        customer_name: debouncedCustomerName
      };
      onSearch(newFilters);
    }
  }, [debouncedCustomerName, currentStore?.id]);

  // Apply initial filters when component mounts
  useEffect(() => {
    if (initialFilters) {
      const newFilters: SearchFilters = {
        contract_code: initialFilters.contract_code || '',
        customer_name: initialFilters.customer_name || '',
        start_date: initialFilters.start_date || '',
        end_date: initialFilters.end_date || '',
        status: initialFilters.status || (initialFilters.contract_code ? '' : 'on_time'), // Empty status when navigating from contract link
        duration: initialFilters.duration || undefined,
        store_id: initialFilters.store_id
      };
      setFilters(newFilters);
    }
  }, [initialFilters]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [id]: value
    }));
  };

  // Handle customer name search with autocomplete
  const handleCustomerNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilters(prev => ({
      ...prev,
      customer_name: value
    }));
    // Note: Không auto-search ngay lập tức ở đây, sẽ được handle bởi debounced useEffect
  };

  // Handle customer selection from dropdown
  const handleCustomerSelect = (customerName: string) => {
    setFilters(prev => ({
      ...prev,
      customer_name: customerName
    }));
    setShowCustomerDropdown(false);
    
    // Trigger immediate search for customer selection (bypass debounce)
    const newFilters = {
      ...filters,
      customer_name: customerName
    };
    onSearch(newFilters);
  };

  const handleStatusChange = (value: string) => {
    const newFilters = {
      ...filters,
      status: value === 'all' ? '' : value
    };
    
    setFilters(newFilters);
    
    // Auto-search when status changes
    onSearch(newFilters);
  };

  const handleDurationChange = (value: string) => {
    const newFilters = {
      ...filters,
      duration: value === 'all' ? undefined : parseInt(value)
    };
    
    setFilters(newFilters);
    
    // Auto-search when duration changes
    onSearch(newFilters);
  };

  const handleCustomDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numValue = value === '' ? undefined : parseInt(value);
    
    const newFilters = {
      ...filters,
      duration: numValue
    };
    
    setFilters(newFilters);
    
    // Auto-search when custom duration changes (with debounce effect)
    if (value === '' || (!isNaN(numValue!) && numValue! > 0)) {
      onSearch(newFilters);
    }
  };

  const handleSearch = () => {
    onSearch(filters);
  };

  const handleReset = () => {
    const resetFilters = {
      contract_code: '',
      customer_name: '',
      start_date: '',
      end_date: '',
      status: 'on_time',
      duration: undefined
    };
    setFilters(resetFilters);
    setShowCustomerDropdown(false);
    onReset();
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
        <div>
          <label htmlFor="contract_code" className="block text-xs font-medium text-gray-700 mb-1 truncate">
            Mã HD
          </label>
          <div className="relative">
            <Input
              id="contract_code"
              placeholder="Nhập mã hợp đồng"
              className={`w-full pr-8 ${initialFilters?.contract_code ? 'border-blue-500 border-2' : ''}`}
              value={filters.contract_code}
              onChange={handleInputChange}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
          </div>
        </div>
        
        <div>
          <label htmlFor="customer_name" className="block text-xs font-medium text-gray-700 mb-1 truncate">
            Tên khách hàng
          </label>
          <div className="relative">
            <Input
              id="customer_name"
              placeholder="Nhập tên, SĐT hoặc CCCD để tìm"
              className={`w-full pr-8 ${initialFilters?.customer_name ? 'border-blue-500 border-2' : ''}`}
              value={filters.customer_name}
              onChange={handleCustomerNameChange}
              onFocus={() => {
                if (filteredCustomers.length > 0) {
                  setShowCustomerDropdown(true);
                }
              }}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 100)}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                {customersLoading ? (
                  <div className="px-3 py-4 text-center text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                    Đang tìm kiếm...
                  </div>
                ) : filteredCustomers.length > 0 ? (
                  filteredCustomers.map(customer => (
                    <div
                      key={customer.id}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
                      onClick={() => handleCustomerSelect(customer.name)}
                    >
                      <div className="font-medium">{customer.name}</div>
                      <div className="text-sm text-gray-500">
                        {customer.phone && `SĐT: ${customer.phone}`}
                        {customer.phone && customer.id_number && ' • '}
                        {customer.id_number && `CCCD: ${customer.id_number}`}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-gray-500">
                    Không tìm thấy khách hàng
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div>
          <label htmlFor="start_date" className="block text-xs font-medium text-gray-700 mb-1 truncate">
            Từ ngày
          </label>
          <DatePicker
            id="start_date"
            value={filters.start_date}
            onChange={(value) => handleInputChange({
              target: { id: 'start_date', value }
            } as React.ChangeEvent<HTMLInputElement>)}
            className="w-full"
          />
        </div>
        
        <div>
          <label htmlFor="end_date" className="block text-xs font-medium text-gray-700 mb-1 truncate">
            Đến ngày
          </label>
          <DatePicker
            id="end_date"
            value={filters.end_date}
            onChange={(value) => handleInputChange({
              target: { id: 'end_date', value }
            } as React.ChangeEvent<HTMLInputElement>)}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="duration" className="block text-xs font-medium text-gray-700 mb-1 truncate">
            Thời gian vay
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Select 
                onValueChange={handleDurationChange} 
                value={filters.duration?.toString() || 'all'}
              >
                <SelectTrigger id="duration" className="w-full">
                  <SelectValue placeholder="Chọn nhanh" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="7">7 ngày</SelectItem>
                  <SelectItem value="14">14 ngày</SelectItem>
                  <SelectItem value="30">30 ngày</SelectItem>
                  <SelectItem value="50">50 ngày</SelectItem>
                  <SelectItem value="60">60 ngày</SelectItem>
                  <SelectItem value="90">90 ngày</SelectItem>
                  <SelectItem value="100">100 ngày</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Input
                type="number"
                placeholder="Nhập số ngày"
                className="w-full"
                value={filters.duration?.toString() || ''}
                onChange={handleCustomDurationChange}
                min="1"
                max="9999"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="pageSize" className="block text-xs font-medium text-gray-700 mb-1 truncate">
            Số mục/trang
          </label>
          <Select value={itemsPerPage.toString()} onValueChange={(value) => onPageSizeChange(parseInt(value))}>
            <SelectTrigger id="pageSize" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="80">80</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="status" className="block text-xs font-medium text-gray-700 mb-1 truncate">
            Trạng thái hợp đồng
          </label>
          <Select value={filters.status} onValueChange={handleStatusChange}>
            <SelectTrigger id="status" className={`w-full ${initialFilters?.status !== undefined ? 'border-blue-500 border-2' : ''}`}>
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {(Object.entries(statusMap) as [string, { label: string; color: string }][]).map(([key, value]) => (
                <SelectItem key={key} value={key}>{value.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-between gap-2 mb-4">
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={onCreateNew}
            size="sm"
            className={`text-white bg-green-600 hover:bg-green-700 ${!canCreateCredit ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!canCreateCredit}
            title={!canCreateCredit ? 'Bạn không có quyền tạo hợp đồng' : ''}
          >
            <PlusIcon className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Thêm mới</span>
            <span className="sm:hidden">Thêm</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            onClick={onExportExcel}
            disabled={exporting}
            title={exporting ? 'Đang xuất...' : 'Xuất Excel'}
          >
            {exporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                <span className="hidden sm:inline">Đang xuất...</span>
                <span className="sm:hidden">Xuất</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Xuất Excel</span>
                <span className="sm:hidden">Excel</span>
              </>
            )}
          </Button>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="bg-gray-100"
            onClick={handleReset}
          >
            <span className="hidden sm:inline">Đặt lại bộ lọc</span>
            <span className="sm:hidden">Đặt lại</span>
          </Button>
          <Button 
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSearch}
          >
            Tìm kiếm
          </Button>
        </div>
      </div>
    </>
  );
}
