'use client';

import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { BlacklistedCustomerModal } from '@/components/BlacklistedCustomers/BlacklistedCustomerModal';
import { searchBlacklistedCustomers } from '@/lib/customer';
import { toast } from '@/components/ui/use-toast';

interface BlacklistedCustomer {
  id: string;
  name: string;
  phone: string | null;
  id_number: string | null;
  address: string | null;
  blacklist_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  store_name: string;
}

export default function BlacklistedCustomersPage() {
  const { currentStore } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BlacklistedCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập số điện thoại hoặc CMND/CCCD để tìm kiếm',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const { data, error } = await searchBlacklistedCustomers(searchQuery.trim());
      
      if (error) {
        throw error;
      }

      setSearchResults(data || []);
      
      if (!data || data.length === 0) {
        toast({
          title: 'Không tìm thấy',
          description: 'Không tìm thấy khách hàng bị báo xấu nào với thông tin này',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error searching blacklisted customers:', error);
      toast({
        title: 'Lỗi',
        description: 'Có lỗi xảy ra khi tìm kiếm khách hàng',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleModalSuccess = () => {
    // Refresh search results if we have searched before
    if (hasSearched && searchQuery.trim()) {
      handleSearch();
    }
  };

  return (
    <Layout>
      <div className="max-w-full">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <AlertCircle className="h-8 w-8 mr-3 text-red-600" />
              Tìm kiếm khách hàng bị báo xấu
            </h1>
            <p className="text-gray-600 mt-2">
              Tìm kiếm thông tin khách hàng bị báo xấu bằng số điện thoại hoặc CMND/CCCD
            </p>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Báo xấu khách hàng
          </Button>
        </div>

        {/* Search Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Tìm kiếm</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="search" className="text-sm font-medium text-gray-700">
                  Tìm kiếm theo CMND, SĐT hoặc tên KH
                </Label>
                <Input
                  id="search"
                  type="text"
                  placeholder="Tìm kiếm theo CMND,SĐT hoặc tên KH"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {isSearching ? 'Đang tìm...' : 'Tìm kiếm'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {hasSearched && (
          <div className="space-y-4">
            {searchResults.length > 0 ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">
                  Kết quả tìm kiếm ({searchResults.length} khách hàng)
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          #
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tên khách hàng
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Số điện thoại
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          CMND
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Địa chỉ
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Lý do
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Thời gian báo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nguồn
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {searchResults.map((customer, index) => (
                        <tr key={customer.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {index + 1}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {customer.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {customer.phone || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {customer.id_number || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                            {customer.address || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                            <div className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                              {customer.blacklist_reason}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-500">
                                {(customer.updated_at || customer.created_at) ? 
                                  format(new Date(customer.updated_at || customer.created_at!), 'HH:mm', { locale: vi }) : 
                                  '-'
                                }
                              </span>
                              <span className="text-xs text-gray-500">
                                {(customer.updated_at || customer.created_at) ? 
                                  format(new Date(customer.updated_at || customer.created_at!), 'dd/MM/yyyy', { locale: vi }) : 
                                  '-'
                                }
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                              {customer.store_name}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Không tìm thấy khách hàng bị báo xấu nào</p>
              </div>
            )}
          </div>
        )}

        {!hasSearched && (
          <div className="text-center py-12">
            <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              Nhập số điện thoại hoặc CMND/CCCD để tìm kiếm khách hàng bị báo xấu
            </p>
          </div>
        )}
      </div>

      {/* Blacklisted Customer Modal */}
      <BlacklistedCustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
      </div>
    </Layout>
  );
} 