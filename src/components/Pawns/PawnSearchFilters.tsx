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
import { PlusIcon, Download, Search, RotateCcw } from 'lucide-react';

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
    status: '',
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
      status: value === 'all' ? '' : value
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
      status: '',
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
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Trạng thái
          </label>
          <Select value={filters.status || 'all'} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn trạng thái" />
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
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Từ ngày
          </label>
          <DatePicker
            value={filters.start_date}
            onChange={(value) => handleDateChange('start_date', value)}
            placeholder="Chọn ngày bắt đầu"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Đến ngày
          </label>
          <DatePicker
            value={filters.end_date}
            onChange={(value) => handleDateChange('end_date', value)}
            placeholder="Chọn ngày kết thúc"
          />
        </div>
        
        <div className="flex items-end gap-2">
          <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 flex-1">
            <Search className="h-4 w-4 mr-1" />
            Tìm kiếm
          </Button>
          <Button onClick={handleReset} variant="outline" className="flex-1">
            <RotateCcw className="h-4 w-4 mr-1" />
            Đặt lại
          </Button>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <Button onClick={onCreateNew} className="bg-green-600 hover:bg-green-700">
            <PlusIcon className="h-4 w-4 mr-1" />
            Tạo mới
          </Button>
          <Button onClick={onExportExcel} variant="outline" className="border-green-600 text-green-600 hover:bg-green-50">
            <Download className="h-4 w-4 mr-1" />
            Xuất Excel
          </Button>
        </div>
      </div>
    </>
  );
} 