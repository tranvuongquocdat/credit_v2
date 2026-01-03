'use client';

import { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';

// Import calculation functions
import { calculateCloseContractInterest as calculatePawnCloseInterest } from '@/lib/Pawns/calculate_close_contract_interest';
import { calculateCloseContractInterest as calculateCreditCloseInterest } from '@/lib/Credits/calculate_close_contract_interest';

// Shadcn UI components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePickerWithControls } from '@/components/ui/date-picker-with-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from 'next/link';

// Import ExcelExport component
import ExcelExport from './components/ExcelExport';

// Interface for contract close data
interface ContractCloseItem {
  id: string;
  contractId: string; // Add original contract ID for calculations
  contractCode: string;
  customerName: string;
  itemName: string;
  loanDate: string;
  closeDate: string;
  closeDateTime: string;
  loanAmount: number;
  interestAmount: number;
  totalAmount: number;
  type: 'Cầm đồ' | 'Tín chấp';
}

export default function ContractClosePage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractCloseItem[]>([]);
  
  // Date range for filtering
  const today = new Date();
  const [startDate, setStartDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(today, 'yyyy-MM-dd')
  );
  
  // Filter states
  const [selectedContractType, setSelectedContractType] = useState<string>('all');

  // Request ID for race condition prevention
  const requestIdRef = useRef(0);

  // Use permissions hook
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  // Check access permission
  const canAccessReport = hasPermission('bao_cao_dong_hop_dong');
  
  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !canAccessReport) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessReport, router]);

  // Function to fetch all data from a query with pagination
  const fetchAllData = async (query: any, pageSize: number = 1000) => {
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(from, from + pageSize - 1);
      
      if (error) {
        console.error('Error fetching data:', error);
        break;
      }

      if (data && data.length > 0) {
        allData = [...allData, ...data];
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  // Calculate interest amount for a contract
  const calculateInterestAmount = async (contractId: string, type: 'Cầm đồ' | 'Tín chấp', closeDate: string): Promise<number> => {
    try {
      // Use the close date as the calculation date
      const calculationDate = format(new Date(closeDate), 'yyyy-MM-dd');
      
      if (type === 'Cầm đồ') {
        // Use pawn calculation function (same as RedeemTab)
        return await calculatePawnCloseInterest(contractId, calculationDate);
      } else {
        // Use credit calculation function (same as CloseTab)
        return await calculateCreditCloseInterest(contractId, calculationDate);
      }
    } catch (error) {
      console.error(`Error calculating interest for ${type} contract ${contractId}:`, error);
      return 0;
    }
  };

  // Fetch closed contracts data
  const fetchClosedContracts = async () => {
    if (!currentStore?.id) return;

    // Increment request ID to track this request
    const currentRequestId = ++requestIdRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const storeId = currentStore.id;
      const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
      const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
      
      // Format dates for query
      const startDateISO = startDateObj.toISOString();
      const endDateISO = endDateObj.toISOString();
      
      const allContracts: ContractCloseItem[] = [];

      // Fetch closed pawn contracts
      if (selectedContractType === 'all' || selectedContractType === 'Cầm đồ') {
        const pawnData = await fetchAllData(
          supabase
            .from('pawns')
            .select(`
              id,
              contract_code,
              loan_date,
              updated_at,
              loan_amount,
              customers (name),
              collateral_detail
            `)
            .eq('store_id', storeId)
            .eq('status', 'closed')
            .gte('updated_at', startDateISO)
            .lte('updated_at', endDateISO)
        );

        if (pawnData) {
          for (const item of pawnData) {
            // Get item name from collateral_detail
            let itemName = '';
            try {
              if (item.collateral_detail) {
                if (typeof item.collateral_detail === 'string') {
                  const parsed = JSON.parse(item.collateral_detail);
                  itemName = parsed.name || '';
                } else if (typeof item.collateral_detail === 'object') {
                  itemName = item.collateral_detail.name || '';
                }
              }
            } catch (e) {
              console.error('Error parsing collateral_detail:', e);
            }

            // Calculate interest amount
            const interestAmount = await calculateInterestAmount(item.id, 'Cầm đồ', item.updated_at);
            const loanAmount = item.loan_amount || 0;
            const totalAmount = loanAmount + interestAmount;

            allContracts.push({
              id: `pawn-${item.id}`,
              contractId: item.id,
              contractCode: item.contract_code || '',
              customerName: item.customers?.name || '',
              itemName: itemName || '',
              loanDate: item.loan_date || '',
              closeDate: new Date(item.updated_at).toLocaleDateString('vi-VN'),
              closeDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
              loanAmount,
              interestAmount,
              totalAmount,
              type: 'Cầm đồ'
            });
          }
        }
      }

      // Fetch closed credit contracts
      if (selectedContractType === 'all' || selectedContractType === 'Tín chấp') {
        const creditData = await fetchAllData(
          supabase
            .from('credits')
            .select(`
              id,
              contract_code,
              loan_date,
              updated_at,
              loan_amount,
              customers (name)
            `)
            .eq('store_id', storeId)
            .eq('status', 'closed')
            .gte('updated_at', startDateISO)
            .lte('updated_at', endDateISO)
        );

        if (creditData) {
          for (const item of creditData) {
            // Calculate interest amount
            const interestAmount = await calculateInterestAmount(item.id, 'Tín chấp', item.updated_at);
            const loanAmount = item.loan_amount || 0;
            const totalAmount = loanAmount + interestAmount;

            allContracts.push({
              id: `credit-${item.id}`,
              contractId: item.id,
              contractCode: item.contract_code || '',
              customerName: item.customers?.name || '',
              itemName: 'Tín Chấp',
              loanDate: item.loan_date || '',
              closeDate: new Date(item.updated_at).toLocaleDateString('vi-VN'),
              closeDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
              loanAmount,
              interestAmount,
              totalAmount,
              type: 'Tín chấp'
            });
          }
        }
      }

      // Sort by close date (newest first)
      allContracts.sort((a, b) => new Date(b.closeDateTime).getTime() - new Date(a.closeDateTime).getTime());

      // Check if this request is still the latest one before setting state
      if (currentRequestId !== requestIdRef.current) {
        return; // A newer request was made, discard this result
      }

      setContracts(allContracts);
    } catch (err) {
      // Only set error if this is still the latest request
      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      console.error('Error fetching closed contracts:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      // Only set loading false if this is still the latest request
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Handle date changes
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchClosedContracts();
  };

  // Load data when component mounts or when filters change
  useEffect(() => {
    if (currentStore?.id && canAccessReport && !permissionsLoading) {
      fetchClosedContracts();
    }
  }, [currentStore?.id, startDate, endDate, selectedContractType, canAccessReport, permissionsLoading]);

  // Loading state for permissions
  if (permissionsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center p-4">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Đang kiểm tra quyền truy cập...</span>
        </div>
      </Layout>
    );
  }

  // Access denied state
  if (!canAccessReport) {
    return (
      <Layout>
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">
            Bạn không có quyền truy cập báo cáo này
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-full">
        {/* Title and Export Button */}
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Báo cáo chuộc đồ, đóng HĐ</h1>
          </div>
          <ExcelExport 
            storeId={currentStore?.id}
            startDate={startDate}
            endDate={endDate}
            storeName={currentStore?.name || 'Unknown'}
            selectedContractType={selectedContractType}
          />
        </div>

        {/* Date range selector and filters */}
        <Card className="mb-4">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <span className="mr-2 text-sm font-medium">Từ ngày</span>
                  <DatePickerWithControls
                    value={startDate} 
                    onChange={handleStartDateChange}
                    placeholder="Chọn ngày bắt đầu"
                    className="w-40"
                  />
                </div>
                <div className="flex items-center">
                  <span className="mx-2 text-sm font-medium">Đến ngày</span>
                  <DatePickerWithControls
                    value={endDate} 
                    onChange={handleEndDateChange}
                    placeholder="Chọn ngày kết thúc"
                    className="w-40"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Loại hình:</span>
                  <Select value={selectedContractType} onValueChange={setSelectedContractType}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="Cầm đồ">Cầm đồ</SelectItem>
                      <SelectItem value="Tín chấp">Tín chấp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleRefresh} 
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Error message */}
        {error && (
          <div className="text-red-700 py-2" role="alert">
            <p>{error}</p>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Đang tải dữ liệu...</span>
          </div>
        )}

        {/* Contracts Table */}
        <Card>
          <CardHeader className="py-3">
            <div className="bg-blue-500 text-white p-2 rounded">
              <CardTitle className="text-base font-bold text-center">Báo cáo hàng cầm đồ được chuộc</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {contracts.length === 0 && !isLoading ? (
              <div className="text-center py-4 text-gray-500">
                Không có hợp đồng nào được đóng trong khoảng thời gian này
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 overflow-auto">
                <Table className="border-collapse">
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12">#</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Loại hình</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mã HĐ</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Khách Hàng</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tên Hàng</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày Vay</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày Tất Toán</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày Giao Dịch</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tiền Vay</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tiền Lãi Phí</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Tổng Tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((contract, index) => (
                      <TableRow key={contract.id} className="hover:bg-gray-50 transition-colors">
                        <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                          {index + 1}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                          {contract.type}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                          <Link
                            href={
                              contract.type === 'Cầm đồ'
                                ? `/pawns/${contract.contractCode}`
                                : `/credits/${contract.contractCode}`
                            }
                            className="text-blue-600 hover:underline"
                          >
                            {contract.contractCode}
                          </Link>
                        </TableCell>
                        <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                          {contract.customerName}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                          {contract.itemName}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                          {contract.loanDate ? new Date(contract.loanDate).toLocaleDateString('vi-VN') : '-'}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                          {contract.closeDate}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                          {contract.closeDateTime}
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200">
                          <span className="text-blue-600 font-medium">
                            {contract.loanAmount.toLocaleString()} VND
                          </span>
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right border-r border-b border-gray-200">
                          <span className={`font-medium ${contract.interestAmount >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {contract.interestAmount.toLocaleString()} VND
                          </span>
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                          <span className="text-green-600 font-medium">
                            {contract.totalAmount.toLocaleString()} VND
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
