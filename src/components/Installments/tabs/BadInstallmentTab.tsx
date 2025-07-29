import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FormRow } from '@/components/ui/FormRow';
import { Icon } from '@/components/ui/Icon';
import { AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { InstallmentWithCustomer } from '@/models/installment';
import { updateCustomer, searchBlacklistedCustomers } from '@/lib/customer';
import { toast } from '@/components/ui/use-toast';

interface BadInstallmentTabProps {
  installment: InstallmentWithCustomer;
  onSuccess?: () => void;
}

interface BlacklistHistoryItem {
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

export function BadInstallmentTab({ installment, onSuccess }: BadInstallmentTabProps) {
  // State for form
  const [blacklistReason, setBlacklistReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // State for blacklist history
  const [blacklistHistory, setBlacklistHistory] = useState<BlacklistHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load blacklist history for the customer
  const loadBlacklistHistory = async () => {
    if (!installment?.customer?.phone && !installment?.customer?.id_number && !installment?.customer?.name) {
      return;
    }

    setIsLoadingHistory(true);
    try {
      // Search by phone number, ID number, or name - try all available fields
      const searchQueries = [
        installment?.customer?.phone,
        installment?.customer?.id_number,
        installment?.customer?.name
      ].filter(Boolean); // Remove null/undefined values
      
      if (searchQueries.length === 0) {
        setBlacklistHistory([]);
        return;
      }

      // Try searching with each available field
      let allResults: any[] = [];
      for (const query of searchQueries) {
        const { data, error } = await searchBlacklistedCustomers(query as string);
        if (!error && data) {
          allResults = [...allResults, ...data];
        }
      }

      // Remove duplicates and filter to match exactly this customer
      const uniqueResults = allResults.filter((item, index, self) => 
        index === self.findIndex(t => t.id === item.id)
      );

      const filteredData = uniqueResults.filter(item => {
        // Match by any available field - phone, id_number, or name
        const phoneMatch = installment?.customer?.phone && item.phone && item.phone === installment.customer.phone;
        const idMatch = installment?.customer?.id_number && item.id_number && item.id_number === installment.customer.id_number;
        const nameMatch = installment?.customer?.name && item.name && item.name === installment.customer.name;
        
        return phoneMatch || idMatch || nameMatch;
      });

      setBlacklistHistory(filteredData);
    } catch (error) {
      console.error('Error loading blacklist history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Load blacklist history when component mounts
  useEffect(() => {
    loadBlacklistHistory();
  }, [installment]);

  // Transform data for table display
  const tableData = blacklistHistory.map((item, index) => ({
    index: index + 1,
    customerName: item.name,
    phone: item.phone || '-',
    idNumber: item.id_number || '-',
    address: item.address || '-',
    reason: (
      <div className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs max-w-xs">
        {item.blacklist_reason}
      </div>
    ),
    reportDate: (
      <div className="flex flex-col">
        <span className="text-xs text-gray-500">
          {(item.updated_at || item.created_at) ? 
            format(new Date(item.updated_at || item.created_at!), 'HH:mm', { locale: vi }) : 
            '-'
          }
        </span>
        <span className="text-xs text-gray-500">
          {(item.updated_at || item.created_at) ? 
            format(new Date(item.updated_at || item.created_at!), 'dd/MM/yyyy', { locale: vi }) : 
            '-'
          }
        </span>
      </div>
    ),
    source: (
      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
        {item.store_name}
      </span>
    )
  }));

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!blacklistReason.trim()) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng nhập lý do báo xấu',
        variant: 'destructive',
      });
      return;
    }

    if (!installment?.customer_id) {
      toast({
        title: 'Lỗi',
        description: 'Không tìm thấy thông tin khách hàng',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await updateCustomer(installment.customer_id, {
        blacklist_reason: blacklistReason.trim()
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Thành công',
        description: 'Đã báo xấu khách hàng thành công',
        variant: 'default',
      });

      // Reset form
      setBlacklistReason('');

      // Reload blacklist history
      await loadBlacklistHistory();

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }

    } catch (error) {
      console.error('Error blacklisting customer:', error);
      toast({
        title: 'Lỗi',
        description: 'Có lỗi xảy ra khi báo xấu khách hàng',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-2 sm:p-4">
      {/* Báo xấu khách hàng section */}
      <div className="mb-4 sm:mb-6">
        <SectionHeader
          icon={<Icon name="warning" />}
          title="Báo xấu khách hàng"
          color="red"
        />
        
        <form onSubmit={handleSubmit} className="border rounded-md p-3 sm:p-4">
          <div className="space-y-4">
            {/* Custom responsive form layout */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-shrink-0 sm:w-32 text-left sm:text-right font-medium">
                Tên khách hàng <span className="text-red-500">*</span>
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  className="border rounded px-3 py-2 w-full bg-gray-100 text-sm sm:text-base"
                  value={installment?.customer?.name || ''}
                  readOnly
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-shrink-0 sm:w-32 text-left sm:text-right font-medium">
                CMND <span className="text-red-500">*</span>
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  className="border rounded px-3 py-2 w-full bg-gray-100 text-sm sm:text-base"
                  value={installment?.customer?.id_number || ''}
                  readOnly
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-shrink-0 sm:w-32 text-left sm:text-right font-medium">
                Số điện thoại
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  className="border rounded px-3 py-2 w-full bg-gray-100 text-sm sm:text-base"
                  value={installment?.customer?.phone || ''}
                  readOnly
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
              <div className="flex-shrink-0 sm:w-32 text-left sm:text-right font-medium sm:pt-2">
                Địa chỉ
              </div>
              <div className="flex-1">
                <textarea
                  className="border rounded px-3 py-2 w-full h-20 sm:h-16 resize-none bg-gray-100 text-sm sm:text-base"
                  value={(installment?.customer as any)?.address || ''}
                  readOnly
                ></textarea>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
              <div className="flex-shrink-0 sm:w-32 text-left sm:text-right font-medium sm:pt-2">
                Nội dung <span className="text-red-500">*</span>
              </div>
              <div className="flex-1">
                <textarea
                  className="border rounded px-3 py-2 w-full h-24 sm:h-20 resize-none text-sm sm:text-base"
                  placeholder="Nhập nội dung báo xấu..."
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  required
                ></textarea>
              </div>
            </div>
          </div>
          
          {/* Check if customer is already blacklisted */}
          {(installment?.customer as any)?.blacklist_reason && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-3 rounded mb-4 mt-4" role="alert">
              <span className="flex items-start">
                <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-sm">
                  Khách hàng này đã bị báo xấu với lý do: "{(installment?.customer as any)?.blacklist_reason}"
                </span>
              </span>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
            <Button 
              type="button"
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm sm:text-base px-4 py-2"
              disabled={isLoading}
            >
              Thoát
            </Button>
            <Button 
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white text-sm sm:text-base px-4 py-2"
              disabled={isLoading || !!(installment?.customer as any)?.blacklist_reason}
            >
              {isLoading ? 'Đang xử lý...' : 'Báo xấu'}
            </Button>
          </div>
        </form>
      </div>
      
      {/* Lịch sử báo xấu section */}
      <div>
        <SectionHeader
          icon={<Icon name="history" />}
          title="Lịch sử báo xấu"
          color="amber"
        />
        
        {isLoadingHistory ? (
          <div className="border rounded-md p-4">
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            {blacklistHistory.length > 0 ? (
              <>
                {/* Mobile Card Layout */}
                <div className="block md:hidden">
                  <div className="space-y-3 p-3">
                    {tableData.map((row, index) => (
                      <div key={index} className="border rounded-lg p-3 bg-white">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded">#{row.index}</span>
                            <span className="text-sm font-medium text-gray-900">{row.customerName}</span>
                          </div>
                          <div className="text-right">
                            {row.source}
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">SĐT:</span>
                            <span>{row.phone}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">CMND:</span>
                            <span>{row.idNumber}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Địa chỉ:</span>
                            <span className="text-right max-w-[200px] truncate" title={row.address as string}>{row.address}</span>
                          </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex flex-col gap-2">
                            <div>
                              <span className="text-xs text-gray-500">Lý do:</span>
                              <div className="mt-1">{row.reason}</div>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-500">Thời gian:</span>
                              <div>{row.reportDate}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Desktop Table Layout */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 text-center">#</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">Tên khách hàng</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">Số điện thoại</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">CMND</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">Địa chỉ</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">Lý do</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">Thời gian báo</th>
                        <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">Nguồn</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tableData.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                            {row.index}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {row.customerName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.phone}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.idNumber}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                            {row.address}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                            {row.reason}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.reportDate}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.source}
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
                <p className="text-gray-500 text-sm">Khách hàng này chưa bị báo xấu</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
