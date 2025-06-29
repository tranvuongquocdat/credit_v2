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
import { useStore } from '@/contexts/StoreContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getCustomers } from '@/lib/customer';
import { Customer } from '@/models/customer';
import { InstallmentStatus } from '@/models/installment';
interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface SearchFiltersProps {
  onSearch: (filters: SearchFilters) => void;
  onReset: () => void;
  onCreateNew: () => void;
  onExportExcel: () => void;
  exporting?: boolean;
  initialFilters?: Partial<SearchFilters>; // Thêm prop để pre-fill form
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
  initialFilters
}: SearchFiltersProps) {
  const statusMap = {
    [InstallmentStatus.ON_TIME]: { label: 'Đang vay', color: 'bg-green-100 text-green-800' },
    [InstallmentStatus.CLOSED]: { label: 'Đã đóng', color: 'bg-blue-100 text-blue-800' },
    [InstallmentStatus.DELETED]: { label: 'Đã xóa', color: 'bg-gray-100 text-gray-800' },
    [InstallmentStatus.DUE_TOMORROW]: { label: 'Ngày mai đóng', color: 'bg-amber-100 text-amber-800' },
  };
  // Get store context
  const { currentStore } = useStore();
  const { hasPermission } = usePermissions();
  // Kiểm tra quyền tạo mới hợp đồng trả góp
  const canCreateInstallment = hasPermission('tao_moi_hop_dong_tra_gop');
  
  // State for customer autocomplete
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    contract_code: '',
    customer_name: '',
    start_date: '',
    end_date: '',
    duration: undefined,
    status: 'on_time', // Fixed default, không dùng initialFilters ở đây
    store_id: undefined // Sẽ được set trong useEffect
  });
  
  // Track if we've already processed initialFilters to prevent double search
  const [hasProcessedInitialFilters, setHasProcessedInitialFilters] = useState(false);
  
  // Load customers for autocomplete
  useEffect(() => {
    if (currentStore?.id) {
      async function loadCustomers() {
        try {
          const { data, error } = await getCustomers(
            1, 
            1000, 
            '', // search query
            currentStore?.id || '', // filter by store_id
            '' // status filter
          );
          if (error) throw error;
          setCustomers(data || []);
        } catch (err) {
          console.error('Error loading customers:', err);
        }
      }
      loadCustomers();
    }
  }, [currentStore?.id]);
  
  // Single useEffect để handle cả store và initialFilters
  useEffect(() => {
    console.log('🔧 SearchFilters useEffect triggered:', { 
      hasCurrentStore: !!currentStore?.id, 
      hasInitialFilters: !!initialFilters,
      hasProcessedInitialFilters 
    });
    
    // Luôn update store_id khi currentStore thay đổi
    if (currentStore?.id) {
      setFilters(prev => ({
        ...prev,
        store_id: currentStore.id
      }));
    }
    
    // Chỉ auto-search khi có initialFilters và chưa xử lý
    if (initialFilters && currentStore?.id && !hasProcessedInitialFilters) {
      console.log('🎯 SearchFilters processing initialFilters for first time:', initialFilters);
      
      // Nếu có contract_code trong initialFilters, dùng status rỗng để hiển thị tất cả trạng thái
      // Nếu không, dùng 'on_time' làm mặc định
      const defaultStatus = initialFilters.contract_code ? '' : 'on_time';
      
      const newFilters = {
        contract_code: '',
        customer_name: '',
        start_date: '',
        end_date: '',
        duration: undefined,
        status: defaultStatus,
        ...initialFilters, // Override với initialFilters (trừ status nếu chưa set)
        store_id: currentStore.id
      };
      
      setFilters(newFilters);
      setHasProcessedInitialFilters(true); // Đánh dấu đã xử lý
      
      // Auto-search chỉ cho navigation từ URL
      onSearch(newFilters);
    }
  }, [currentStore?.id, initialFilters, hasProcessedInitialFilters]);
  
  // Reset processed flag khi initialFilters thay đổi (new navigation)
  useEffect(() => {
    if (initialFilters) {
      setHasProcessedInitialFilters(false);
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
    const newFilters = {
      ...filters,
      customer_name: value
    };
    
    setFilters(newFilters);
    
    if (value.trim() === '') {
      setFilteredCustomers([]);
      setShowCustomerDropdown(false);
    } else {
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(value.toLowerCase()) ||
        (customer.phone && customer.phone.includes(value)) ||
        (customer.id_number && customer.id_number.includes(value))
      );
      setFilteredCustomers(filtered);
      setShowCustomerDropdown(filtered.length > 0);
    }
    
    // Auto-search when customer name changes
    onSearch(newFilters);
  };

  // Handle customer selection from dropdown
  const handleCustomerSelect = (customerName: string) => {
    const newFilters = {
      ...filters,
      customer_name: customerName
    };
    
    setFilters(newFilters);
    setShowCustomerDropdown(false);
    
    // Auto-search when customer is selected
    onSearch(newFilters);
  };

  const handleStatusChange = (value: string) => {
    const newFilters = {
      ...filters,
      status: value === 'all' ? '' : value
    };
    
    setFilters(newFilters);
    
    // Auto-search khi thay đổi status
    onSearch(newFilters);
  };
  
  const handleDurationChange = (value: string) => {
    const newFilters = {
      ...filters,
      duration: value === 'all' ? undefined : parseInt(value)
    };
    
    setFilters(newFilters);
    
    // Auto-search khi thay đổi duration
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
    console.log('🔍 SearchFilters handleSearch called with filters:', filters);
    onSearch(filters);
  };

  const handleReset = () => {
    setFilters({
      contract_code: '',
      customer_name: '',
      start_date: '',
      end_date: '',
      duration: undefined,
      status: 'on_time',
      store_id: currentStore?.id
    });
    onReset();
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
        <div>
          <label htmlFor="contract_code" className="block text-sm font-medium text-gray-700 mb-1">
            Mã HĐ
          </label>
          <div className="relative">
            <Input
              id="contract_code"
              placeholder="Nhập mã hợp đồng"
              className={`w-full pr-8 ${filters.contract_code && initialFilters?.contract_code ? 'border-blue-500 bg-blue-50' : ''}`}
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
          <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700 mb-1">
            Tên khách hàng
          </label>
          <div className="relative">
            <Input
              id="customer_name"
              placeholder="Nhập tên, SĐT hoặc CCCD để tìm"
              className="w-full pr-8"
              value={filters.customer_name}
              onChange={handleCustomerNameChange}
              onFocus={() => {
                if (filteredCustomers.length > 0) {
                  setShowCustomerDropdown(true);
                }
              }}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                {filteredCustomers.map(customer => (
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
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div>
          <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-1">
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
          <label htmlFor="end_date" className="block text-sm font-medium text-gray-700 mb-1">
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
          <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
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
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Trạng thái hợp đồng
          </label>
          <Select value={filters.status} onValueChange={handleStatusChange}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {Object.entries(statusMap).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-between gap-2 mb-4">
        <div className="flex gap-2">
          <Button 
            onClick={onCreateNew}
            size="sm"
            className="text-white bg-green-600 hover:bg-green-700"
            disabled={!canCreateInstallment}
            title={!canCreateInstallment ? 'Bạn không có quyền tạo mới hợp đồng trả góp' : ''}
          >
            <PlusIcon className="mr-1 h-3.5 w-3.5" />
            Thêm mới
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
                Đang xuất...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Xuất Excel
              </>
            )}
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="bg-gray-100"
            onClick={handleReset}
          >
            Đặt lại bộ lọc
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
