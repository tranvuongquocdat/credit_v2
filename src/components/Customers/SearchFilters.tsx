'use client';

import { useState, useEffect } from 'react';
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
import { UserPlus, SearchIcon, PlusIcon } from 'lucide-react';

interface StatusMapType {
  [key: string]: { 
    label: string; 
    color: string;
  }
}

interface SearchFiltersProps {
  statusMap: StatusMapType;
  stores: Store[];
  initialFilters?: CustomerSearchFilters;
  onSearch: (filters: CustomerSearchFilters) => void;
  onReset: () => void;
  onCreateNew: () => void;
}

export interface CustomerSearchFilters {
  query: string;
  store: string;
  status: string;
}

export function SearchFilters({ 
  statusMap, 
  stores,
  initialFilters,
  onSearch, 
  onReset, 
  onCreateNew
}: SearchFiltersProps) {
  const [filters, setFilters] = useState<CustomerSearchFilters>(initialFilters || {
    query: '',
    store: 'all',
    status: 'all'
  });

  // Update filters when initialFilters change
  useEffect(() => {
    if (initialFilters) {
      console.log('SearchFilters received initialFilters:', initialFilters);
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  const handleFilterChange = (key: keyof CustomerSearchFilters, value: string) => {
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
    const resetFilters = {
      query: '',
      store: initialFilters?.store || 'all',
      status: 'all'
    };
    setFilters(resetFilters);
    onReset();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
            Tìm kiếm
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
            onValueChange={value => {
              console.log('Store select changed to:', value);
              handleFilterChange('store', value);
            }}
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
              {Object.entries(statusMap).map(([value, { label }]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
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
            onClick={handleSubmit}
          >
            Tìm kiếm
          </Button>
        </div>
      </div>
    </div>
  );
}