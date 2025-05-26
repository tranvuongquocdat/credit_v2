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
import { PawnStatus } from '@/models/pawn';
import { PlusIcon } from 'lucide-react';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface PawnFilters {
  contract_code: string;
  customer_name: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface PawnSearchFiltersProps {
  statusMap: StatusMapType;
  onSearch: (filters: PawnFilters) => void;
  onReset: () => void;
  onCreateNew: () => void;
  onExportExcel: () => void;
}

export function PawnSearchFilters({ 
  statusMap, 
  onSearch, 
  onReset, 
  onCreateNew, 
  onExportExcel 
}: PawnSearchFiltersProps) {
  const [filters, setFilters] = useState<PawnFilters>({
    contract_code: '',
    customer_name: '',
    status: 'on_time',
    start_date: '',
    end_date: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handleStatusChange = (value: string) => {
    setFilters(prev => ({
      ...prev,
      status: value
    }));
  };

  const handleDateChange = (field: 'start_date' | 'end_date', value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = () => {
    onSearch(filters);
  };

  const handleReset = () => {
    const emptyFilters: PawnFilters = {
      contract_code: '',
      customer_name: '',
      status: 'on_time',
      start_date: '',
      end_date: ''
    };
    setFilters(emptyFilters);
    onReset();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
        <div>
          <label htmlFor="contract_code" className="block text-sm font-medium text-gray-700 mb-1">
            Mã HĐ
          </label>
          <div className="relative">
            <Input
              id="contract_code"
              placeholder="Nhập mã hợp đồng"
              className="w-full pr-8"
              value={filters.contract_code}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
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
              className="w-full pr-8"
              value={filters.customer_name}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
            onChange={(value) => handleDateChange('start_date', value)}
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
            onChange={(value) => handleDateChange('end_date', value)}
            className="w-full"
          />
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
              {Object.entries(statusMap).map(([status, config]) => (
                <SelectItem key={status} value={status}>
                  {config.label}
                </SelectItem>
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