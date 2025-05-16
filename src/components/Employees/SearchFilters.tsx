'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Store } from '@/models/store';
import { EmployeeStatus } from '@/models/employee';
import { SearchIcon, PlusIcon } from 'lucide-react';

interface SearchFiltersProps {
  stores: Store[];
  onSearch: (filters: EmployeeSearchFilters) => void;
  onReset: () => void;
  onCreateNew: () => void;
}

export interface EmployeeSearchFilters {
  query: string;
  store: string;
  status: string;
}

export function SearchFilters({ 
  stores,
  onSearch, 
  onReset, 
  onCreateNew
}: SearchFiltersProps) {
  const [filters, setFilters] = useState<EmployeeSearchFilters>({
    query: '',
    store: 'all',
    status: 'all'
  });

  const handleFilterChange = (key: keyof EmployeeSearchFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filters);
  };

  const handleReset = () => {
    setFilters({
      query: '',
      store: 'all',
      status: 'all'
    });
    onReset();
  };

  return (
    <div className="space-y-4 bg-background rounded-md">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
            Tên nhân viên
          </label>
          <div className="relative">
            <Input
              id="query"
              placeholder="Tìm kiếm..."
              className="w-full pr-8"
              value={filters.query}
              onChange={(e) => handleFilterChange('query', e.target.value)}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
              <SearchIcon className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="store" className="block text-sm font-medium text-gray-700 mb-1">
            Cửa hàng
          </label>
          <Select
            value={filters.store}
            onValueChange={value => handleFilterChange('store', value)}
          >
            <SelectTrigger id="store" className="w-full">
              <SelectValue placeholder="Cửa hàng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả cửa hàng</SelectItem>
              {stores.map(store => (
                <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Trạng thái
          </label>
          <Select
            value={filters.status}
            onValueChange={value => handleFilterChange('status', value)}
          >
            <SelectTrigger id="status" className="w-full">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value={EmployeeStatus.WORKING}>Đang làm việc</SelectItem>
              <SelectItem value={EmployeeStatus.INACTIVE}>Đã nghỉ việc</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col justify-end gap-2 md:flex-row md:items-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleReset}
          >
            Đặt lại bộ lọc
          </Button>
          <Button 
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit}
            type="submit"
          >
            Tìm kiếm
          </Button>
        </div>
      </div>

      <div className="flex justify-between items-center pt-4">
        <Button 
          onClick={onCreateNew}
          size="sm"
          className="text-white bg-green-600 hover:bg-green-700"
        >
          <PlusIcon className="mr-1 h-3.5 w-3.5" />
          Thêm nhân viên
        </Button>
      </div>
    </div>
  );
}
