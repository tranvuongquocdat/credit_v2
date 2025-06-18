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
import { PlusIcon, Search, AlertTriangle } from 'lucide-react';

export interface AdminSearchFilters {
  query: string;
  status: string;
}

interface SearchFiltersProps {
  onSearch: (filters: AdminSearchFilters) => void;
  onReset: () => void;
  onCreateNew: () => void;
  onDeactivateAll: () => void;
}

export function SearchFilters({ onSearch, onReset, onCreateNew, onDeactivateAll }: SearchFiltersProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const handleSearch = () => {
    onSearch({ query, status });
  };

  const handleReset = () => {
    setQuery('');
    setStatus('all');
    onReset();
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    onSearch({ query, status: value });
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
            Tìm kiếm
          </label>
          <div className="relative">
            <Input
              id="query"
              placeholder="Tên, username, email..."
              className="w-full pr-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400">
              <Search className="h-4 w-4" />
            </div>
          </div>
        </div>
        
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Trạng thái
          </label>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="active">Hoạt động</SelectItem>
              <SelectItem value="inactive">Vô hiệu hóa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-end">
          <Button 
            onClick={handleSearch}
            className="bg-blue-600 hover:bg-blue-700 text-white mr-2"
          >
            <Search className="mr-1 h-4 w-4" />
            Tìm kiếm
          </Button>
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
            Thêm Admin
          </Button>
          <Button
            onClick={onDeactivateAll}
            size="sm"
            className="text-white bg-red-600 hover:bg-red-700"
          >
            <AlertTriangle className="mr-1 h-3.5 w-3.5" />
            SOS
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
        </div>
      </div>
    </>
  );
} 