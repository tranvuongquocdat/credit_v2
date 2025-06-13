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
import { PlusIcon } from 'lucide-react';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface SearchFiltersProps {
  statusMap: StatusMapType;
  onSearch: (filters: SearchFilters) => void;
  onReset: () => void;
  onCreateNew: () => void;
  onExportExcel: () => void;
  initialFilters?: Partial<SearchFilters>;
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
  statusMap, 
  onSearch, 
  onReset, 
  onCreateNew, 
  onExportExcel,
  initialFilters 
}: SearchFiltersProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    contract_code: '',
    customer_name: '',
    start_date: '',
    end_date: '',
    status: 'on_time',
    duration: undefined
  });

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
    onReset();
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
        <div>
          <label htmlFor="contract_code" className="block text-sm font-medium text-gray-700 mb-1">
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
          <label htmlFor="customer_name" className="block text-sm font-medium text-gray-700 mb-1">
            Tên khách hàng
          </label>
          <div className="relative">
            <Input
              id="customer_name"
              placeholder="Nhập tên khách hàng"
              className={`w-full pr-8 ${initialFilters?.customer_name ? 'border-blue-500 border-2' : ''}`}
              value={filters.customer_name}
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
          <Select onValueChange={handleDurationChange} value={filters.duration?.toString() || 'all'}>
            <SelectTrigger id="duration" className="w-full">
              <SelectValue placeholder="Tất cả" />
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
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Trạng thái hợp đồng
          </label>
          <Select value={filters.status} onValueChange={handleStatusChange}>
            <SelectTrigger id="status" className={`w-full ${initialFilters?.status !== undefined ? 'border-blue-500 border-2' : ''}`}>
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
          >
            <PlusIcon className="mr-1 h-3.5 w-3.5" />
            Thêm mới
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            onClick={onExportExcel}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Xuất Excel
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
