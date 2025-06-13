'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse } from 'date-fns';
import { RefreshCw } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from 'next/link';

// Interface for deleted contract data
interface DeletedContractItem {
  id: string;
  contractCode: string;
  customerName: string;
  itemName: string;
  loanDate: string;
  deletedDate: string;
  deletedDateTime: string;
  loanAmount: number;
  type: 'Cầm đồ' | 'Tín chấp' | 'Trả góp';
}

export default function ContractDeletedPage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<DeletedContractItem[]>([]);
  
  // Date range for filtering (empty by default to show all history)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Filter states
  const [selectedContractType, setSelectedContractType] = useState<string>('all');

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

  // Fetch deleted contracts data
  const fetchDeletedContracts = async () => {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const storeId = currentStore.id;
      const allContracts: DeletedContractItem[] = [];

      // Build date filters if provided
      let dateFilter = {};
      if (startDate && endDate) {
        const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
        const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
        const startDateISO = startDateObj.toISOString();
        const endDateISO = endDateObj.toISOString();
        
        dateFilter = {
          gte: ['updated_at', startDateISO],
          lte: ['updated_at', endDateISO]
        };
      }

      // Fetch deleted pawn contracts
      if (selectedContractType === 'all' || selectedContractType === 'Cầm đồ') {
        let pawnQuery = supabase
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
          .eq('status', 'deleted');

        // Apply date filters if provided
        if (startDate && endDate) {
          const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
          const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
          pawnQuery = pawnQuery
            .gte('updated_at', startDateObj.toISOString())
            .lte('updated_at', endDateObj.toISOString());
        }

        const pawnData = await fetchAllData(pawnQuery);

        if (pawnData) {
          pawnData.forEach((item) => {
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

            allContracts.push({
              id: `pawn-${item.id}`,
              contractCode: item.contract_code || '',
              customerName: item.customers?.name || '',
              itemName: itemName || '',
              loanDate: item.loan_date || '',
              deletedDate: new Date(item.updated_at).toLocaleDateString('vi-VN'),
              deletedDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
              loanAmount: item.loan_amount || 0,
              type: 'Cầm đồ'
            });
          });
        }
      }

      // Fetch deleted credit contracts
      if (selectedContractType === 'all' || selectedContractType === 'Tín chấp') {
        let creditQuery = supabase
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
          .eq('status', 'deleted');

        // Apply date filters if provided
        if (startDate && endDate) {
          const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
          const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
          creditQuery = creditQuery
            .gte('updated_at', startDateObj.toISOString())
            .lte('updated_at', endDateObj.toISOString());
        }

        const creditData = await fetchAllData(creditQuery);

        if (creditData) {
          creditData.forEach((item) => {
            allContracts.push({
              id: `credit-${item.id}`,
              contractCode: item.contract_code || '',
              customerName: item.customers?.name || '',
              itemName: 'Tín chấp', // Always "Tín chấp" for credit contracts
              loanDate: item.loan_date || '',
              deletedDate: new Date(item.updated_at).toLocaleDateString('vi-VN'),
              deletedDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
              loanAmount: item.loan_amount || 0,
              type: 'Tín chấp'
            });
          });
        }
      }

      // Fetch deleted installment contracts
      if (selectedContractType === 'all' || selectedContractType === 'Trả góp') {
        let installmentQuery = supabase
          .from('installments')
          .select(`
            id,
            contract_code,
            loan_date,
            updated_at,
            down_payment,
            customers (name)
          `)
          .eq('status', 'deleted');

        // For installments, we need to filter by store through employees table
        // Get employees of the current store first
        const { data: storeEmployees } = await supabase
          .from('employees')
          .select('id')
          .eq('store_id', storeId);

        if (storeEmployees && storeEmployees.length > 0) {
          const employeeIds = storeEmployees.map(emp => emp.id);
          installmentQuery = installmentQuery.in('employee_id', employeeIds);

          // Apply date filters if provided
          if (startDate && endDate) {
            const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
            const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
            installmentQuery = installmentQuery
              .gte('updated_at', startDateObj.toISOString())
              .lte('updated_at', endDateObj.toISOString());
          }

          const installmentData = await fetchAllData(installmentQuery);

          if (installmentData) {
            installmentData.forEach((item) => {
              allContracts.push({
                id: `installment-${item.id}`,
                contractCode: item.contract_code || '',
                customerName: item.customers?.name || '',
                itemName: 'Vay Họ', // Always "Vay Họ" for installment contracts
                loanDate: item.loan_date || '',
                deletedDate: new Date(item.updated_at).toLocaleDateString('vi-VN'),
                deletedDateTime: new Date(item.updated_at).toLocaleString('vi-VN'),
                loanAmount: item.down_payment || 0,
                type: 'Trả góp'
              });
            });
          }
        }
      }
      
      // Sort by deleted date (newest first)
      allContracts.sort((a, b) => new Date(b.deletedDateTime).getTime() - new Date(a.deletedDateTime).getTime());
      
      setContracts(allContracts);
    } catch (err) {
      console.error('Error fetching deleted contracts:', err);
      setError('Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedContracts();
  }, [currentStore?.id, startDate, endDate, selectedContractType]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'startDate') {
      setStartDate(value);
    } else if (name === 'endDate') {
      setEndDate(value);
    }
  };

  const handleRefresh = () => {
    fetchDeletedContracts();
  };

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Báo cáo hợp đồng đã xoá</h1>
          
          {/* Filters */}
          <Card className="mb-4">
            <CardHeader className="py-3">
              <CardTitle className="text-base font-bold">Bộ lọc</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Contract Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loại hình
                  </label>
                  <Select value={selectedContractType} onValueChange={setSelectedContractType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại hình" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="Cầm đồ">Cầm đồ</SelectItem>
                      <SelectItem value="Tín chấp">Tín chấp</SelectItem>
                      <SelectItem value="Trả góp">Trả góp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Từ ngày
                  </label>
                  <Input
                    type="date"
                    name="startDate"
                    value={startDate}
                    onChange={handleDateChange}
                    className="w-full"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Đến ngày
                  </label>
                  <Input
                    type="date"
                    name="endDate"
                    value={endDate}
                    onChange={handleDateChange}
                    className="w-full"
                  />
                </div>

                {/* Refresh Button */}
                <div className="flex items-end">
                  <Button 
                    onClick={handleRefresh}
                    className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Tìm kiếm
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Table */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base font-bold bg-blue-500 text-white p-2 rounded">
                Báo cáo hợp đồng đã bị huỷ
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  <span>Đang tải dữ liệu...</span>
                </div>
              ) : error ? (
                <div className="text-red-700 py-2" role="alert">
                  <p>{error}</p>
                </div>
              ) : contracts.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  Không có hợp đồng nào bị huỷ trong khoảng thời gian này
                </div>
              ) : (
                <div className="rounded-md border border-gray-200 overflow-auto">
                  <Table className="border-collapse">
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12">#</TableHead>
                        <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Mã HĐ</TableHead>
                        <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tên KH</TableHead>
                        <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Tên hàng</TableHead>
                        <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày tạo hợp đồng</TableHead>
                        <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200">Ngày huỷ hợp đồng</TableHead>
                        <TableHead className="py-2 px-3 text-center font-bold border-b border-gray-200">Tiền vay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contracts.map((contract, index) => (
                        <TableRow key={contract.id} className="hover:bg-gray-50 transition-colors">
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            {index + 1}
                          </TableCell>
                          <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                            <Link
                              href={
                                contract.type === 'Tín chấp'
                                  ? `/credits/${contract.contractCode}`
                                  : contract.type === 'Cầm đồ'
                                    ? `/pawns/${contract.contractCode}`
                                    : contract.type === 'Trả góp'
                                      ? `/installments/${contract.contractCode}`
                                      : '#'
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
                            {new Date(contract.loanDate).toLocaleDateString('vi-VN')}
                          </TableCell>
                          <TableCell className="py-2 px-3 border-r border-b border-gray-200">
                            {contract.deletedDateTime}
                          </TableCell>
                          <TableCell className="py-2 px-3 text-right border-b border-gray-200">
                            <span className="text-blue-600 font-medium">
                              {contract.loanAmount.toLocaleString()} VND
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
      </div>
    </Layout>
  );
}
