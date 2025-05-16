import { useState } from 'react';
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
import { CreditStatus } from '@/models/credit';
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
}

export interface SearchFilters {
  contractCode: string;
  customerName: string;
  startDate: string;
  endDate: string;
  status: string;
}

export function SearchFilters({ 
  statusMap, 
  onSearch, 
  onReset, 
  onCreateNew, 
  onExportExcel 
}: SearchFiltersProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    contractCode: '',
    customerName: '',
    startDate: '',
    endDate: '',
    status: ''
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

  const handleSearch = () => {
    onSearch(filters);
  };

  const handleReset = () => {
    setFilters({
      contractCode: '',
      customerName: '',
      startDate: '',
      endDate: '',
      status: ''
    });
    onReset();
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
        <div>
          <label htmlFor="contractCode" className="block text-sm font-medium text-gray-700 mb-1">
            Mã HD
          </label>
          <div className="relative">
            <Input
              id="contractCode"
              placeholder="Nhập mã hợp đồng"
              className="w-full pr-8"
              value={filters.contractCode}
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
          <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">
            Tên khách hàng
          </label>
          <div className="relative">
            <Input
              id="customerName"
              placeholder="Nhập tên khách hàng"
              className="w-full pr-8"
              value={filters.customerName}
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
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
            Từ ngày
          </label>
          <DatePicker
            id="startDate"
            value={filters.startDate}
            onChange={(value) => handleInputChange({
              target: { id: 'startDate', value }
            } as React.ChangeEvent<HTMLInputElement>)}
            className="w-full"
          />
        </div>
        
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
            Đến ngày
          </label>
          <DatePicker
            id="endDate"
            value={filters.endDate}
            onChange={(value) => handleInputChange({
              target: { id: 'endDate', value }
            } as React.ChangeEvent<HTMLInputElement>)}
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
