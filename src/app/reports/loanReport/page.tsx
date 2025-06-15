'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/contexts/StoreContext';
import { format, startOfDay, endOfDay, parse } from 'date-fns';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

// Import status calculation functions
import { calculatePawnStatus } from '@/lib/Pawns/calculate_pawn_status';
import { calculateCreditStatus } from '@/lib/Credits/calculate_credit_status';
import { calculateInstallmentStatus } from '@/lib/Installments/calculate_installment_status';

// Import Excel Export component
import ExcelExport from './components/ExcelExport';

// Shadcn UI components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

// Interface for loan report data
interface LoanReportItem {
  id: string;
  contractId: string;
  contractCode: string;
  customerName: string;
  itemName: string;
  loanAmount: number;
  loanDate: string;
  status: string;
  statusCode: string;
  type: 'Cầm đồ' | 'Tín chấp' | 'Trả góp';
}

export default function LoanReportPage() {
  const { currentStore } = useStore();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loanReports, setLoanReports] = useState<LoanReportItem[]>([]);
  const [allLoanReports, setAllLoanReports] = useState<LoanReportItem[]>([]);
  const [totalLoanAmount, setTotalLoanAmount] = useState<number>(0);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const itemsPerPage = 50;
  
  // Date range for filtering (empty by default to show all history)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Filter states
  const [selectedContractType, setSelectedContractType] = useState<string>('all');

  // Function to get status display text
  const getStatusText = (statusCode: string) => {
    switch (statusCode) {
      case 'ACTIVE':
        return 'Đang vay';
      case 'LATE_INTEREST':
        return 'Chậm trả';
      case 'OVERDUE':
        return 'Trễ hạn';
      default:
        return statusCode;
    }
  };

  // Function to get status color
  const getStatusColor = (statusCode: string) => {
    switch (statusCode) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'LATE_INTEREST':
        return 'bg-yellow-100 text-yellow-800';
      case 'OVERDUE':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Function to count total records (simplified - will be calculated after status evaluation)
  const countTotalRecords = async (filteredItems: LoanReportItem[]) => {
    const totalCount = filteredItems.length;
    const totalAmount = filteredItems.reduce((sum, item) => sum + item.loanAmount, 0);
    
    setTotalRecords(totalCount);
    setTotalLoanAmount(totalAmount);
    setTotalPages(Math.ceil(totalCount / itemsPerPage));
    
    return totalCount;
  };

  // Fetch loan report data
  const fetchLoanReports = async () => {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const storeId = currentStore.id;
      const allRawData: any[] = [];

      // Fetch pawns (all records, no status filtering)
      if (selectedContractType === 'all' || selectedContractType === 'Cầm đồ') {
        let pawnQuery = supabase
          .from('pawns')
          .select(`
            id,
            contract_code,
            loan_amount,
            loan_date,
            status,
            customers(name),
            collateral_detail
          `)
          .eq('store_id', storeId)
          .order('loan_date', { ascending: false });

        // Apply date filters if provided
        if (startDate && endDate) {
          const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
          const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
          pawnQuery = pawnQuery
            .gte('loan_date', startDateObj.toISOString())
            .lte('loan_date', endDateObj.toISOString());
        } else {
          // Limit to recent records when no date filter to improve performance
          pawnQuery = pawnQuery.limit(500);
        }

        const { data: pawnData, error: pawnError } = await pawnQuery;

        if (pawnError) {
          console.error('Error fetching pawns:', pawnError);
        } else if (pawnData) {
          for (const item of pawnData) {
            allRawData.push({ ...item, type: 'Cầm đồ' });
          }
        }
      }

      // Fetch credits (all records, no status filtering)
      if (selectedContractType === 'all' || selectedContractType === 'Tín chấp') {
        let creditQuery = supabase
          .from('credits')
          .select(`
            id,
            contract_code,
            loan_amount,
            loan_date,
            status,
            customers(name),
            collateral
          `)
          .eq('store_id', storeId)
          .order('loan_date', { ascending: false });

        // Apply date filters if provided
        if (startDate && endDate) {
          const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
          const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
          creditQuery = creditQuery
            .gte('loan_date', startDateObj.toISOString())
            .lte('loan_date', endDateObj.toISOString());
        } else {
          // Limit to recent records when no date filter to improve performance
          creditQuery = creditQuery.limit(500);
        }

        const { data: creditData, error: creditError } = await creditQuery;

        if (creditError) {
          console.error('Error fetching credits:', creditError);
        } else if (creditData) {
          for (const item of creditData) {
            allRawData.push({ ...item, type: 'Tín chấp' });
          }
        }
      }

      // Fetch installments (all records, no status filtering)
      if (selectedContractType === 'all' || selectedContractType === 'Trả góp') {
        let installmentQuery = supabase
          .from('installments_by_store')
          .select(`
            id,
            contract_code,
            installment_amount,
            loan_date,
            status,
            customers(name)
          `)
          .eq('store_id', storeId)
          .order('loan_date', { ascending: false });

        // Apply date filters if provided
        if (startDate && endDate) {
          const startDateObj = startOfDay(parse(startDate, 'yyyy-MM-dd', new Date()));
          const endDateObj = endOfDay(parse(endDate, 'yyyy-MM-dd', new Date()));
          installmentQuery = installmentQuery
            .gte('loan_date', startDateObj.toISOString())
            .lte('loan_date', endDateObj.toISOString());
        } else {
          // Limit to recent records when no date filter to improve performance
          installmentQuery = installmentQuery.limit(500);
        }

        const { data: installmentData, error: installmentError } = await installmentQuery;

        if (installmentError) {
          console.error('Error fetching installments:', installmentError);
        } else if (installmentData) {
          for (const item of installmentData) {
            allRawData.push({ ...item, type: 'Trả góp' });
          }
        }
      }

      // Calculate status for each item in parallel and filter only active loan contracts
      const processedData: LoanReportItem[] = [];
      
      // Process in chunks to avoid overwhelming the system
      const chunkSize = 20;
      const chunks = [];
      for (let i = 0; i < allRawData.length; i += chunkSize) {
        chunks.push(allRawData.slice(i, i + chunkSize));
      }
      
      for (const chunk of chunks) {
        // Process each chunk in parallel
        const chunkResults = await Promise.allSettled(
          chunk.map(async (item) => {
            try {
              let statusResult;
              
              // Calculate status based on type
              if (item.type === 'Cầm đồ') {
                statusResult = await calculatePawnStatus(item.id);
              } else if (item.type === 'Tín chấp') {
                statusResult = await calculateCreditStatus(item.id);
              } else if (item.type === 'Trả góp') {
                statusResult = await calculateInstallmentStatus(item.id);
              }
              
              // Only include contracts that are currently active (being loaned)
              if (statusResult && ['ACTIVE', 'LATE_INTEREST', 'OVERDUE'].includes(statusResult.statusCode)) {
                let itemName = '';
                let loanAmount = 0;
                
                // Get item name based on type
                if (item.type === 'Cầm đồ') {
                  try {
                    if (item.collateral_detail) {
                      const detail = typeof item.collateral_detail === 'string' 
                        ? JSON.parse(item.collateral_detail) 
                        : item.collateral_detail;
                      itemName = detail.name || '';
                    }
                  } catch (e) {
                    console.error('Error parsing collateral_detail:', e);
                  }
                  loanAmount = item.loan_amount || 0;
                } else if (item.type === 'Tín chấp') {
                  itemName = item.collateral || 'Tín chấp';
                  loanAmount = item.loan_amount || 0;
                } else if (item.type === 'Trả góp') {
                  itemName = 'Trả góp';
                  loanAmount = item.installment_amount || 0;
                }

                return {
                  id: `${item.type.toLowerCase().replace(' ', '')}-${item.id}`,
                  contractId: item.id || '',
                  contractCode: item.contract_code || '',
                  customerName: item.customers?.name || '',
                  itemName,
                  loanAmount,
                  loanDate: item.loan_date ? format(new Date(item.loan_date), 'dd-MM-yyyy') : '',
                  status: statusResult.status,
                  statusCode: statusResult.statusCode,
                  type: item.type
                };
              }
              return null;
            } catch (error) {
              console.error(`Error calculating status for ${item.type} ${item.id}:`, error);
              return null;
            }
          })
        );
        
        // Add successful results to processedData
        chunkResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            processedData.push(result.value);
          }
        });
      }

      // Sort by loan date descending
      processedData.sort((a, b) => new Date(b.loanDate.split('-').reverse().join('-')).getTime() - new Date(a.loanDate.split('-').reverse().join('-')).getTime());
      
      // Store all processed data for Excel export
      setAllLoanReports(processedData);
      
      // Update total counts
      await countTotalRecords(processedData);
      
      // Apply pagination
      const offset = (currentPage - 1) * itemsPerPage;
      const paginatedData = processedData.slice(offset, offset + itemsPerPage);
      
      setLoanReports(paginatedData);
      
    } catch (error) {
      console.error('Error fetching loan reports:', error);
      setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on component mount and when dependencies change
  useEffect(() => {
    if (currentStore?.id) {
      fetchLoanReports();
    }
  }, [currentStore?.id, startDate, endDate, selectedContractType, currentPage]);

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setCurrentPage(1);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setCurrentPage(1);
  };

  const handleContractTypeChange = (value: string) => {
    setSelectedContractType(value);
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    setCurrentPage(1);
    fetchLoanReports();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-blue-600">
                Báo cáo hợp đồng đang cho vay
              </CardTitle>
              <ExcelExport 
                data={allLoanReports}
                storeId={currentStore?.id}
                startDate={startDate}
                endDate={endDate}
                storeName={currentStore?.name || 'Unknown'}
                selectedContractType={selectedContractType}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Contract Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Loại hình</label>
                <Select value={selectedContractType} onValueChange={handleContractTypeChange}>
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Từ ngày</label>
                <DatePickerWithControls
                  value={startDate}
                  onChange={handleStartDateChange}
                  placeholder="Chọn ngày bắt đầu"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Đến ngày</label>
                <DatePickerWithControls
                  value={endDate}
                  onChange={handleEndDateChange}
                  placeholder="Chọn ngày kết thúc"
                />
              </div>

              {/* Search Button */}
              <div className="space-y-2">
                <label className="text-sm font-medium">&nbsp;</label>
                <Button 
                  onClick={handleRefresh} 
                  className="w-full bg-blue-600 hover:bg-blue-700"
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
          <CardContent className="p-0">
            {error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                {error}
              </div>
            )}
            
            {/* Pagination Info */}
            {!isLoading && totalRecords > 0 && (
              <div className="px-4 py-2 bg-blue-50 border-b">
                <div className="flex justify-between items-center text-sm text-blue-600">
                  <span>
                    Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalRecords)} của {totalRecords} bản ghi
                  </span>
                  <span>
                    Trang {currentPage} / {totalPages}
                  </span>
                </div>
              </div>
            )}
            
            {isLoading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-gray-600">Đang tải dữ liệu...</p>
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 overflow-auto">
                <Table className="border-collapse">
                  <TableHeader className="bg-blue-600 text-white">
                    <TableRow>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 w-12 text-white">#</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 text-white">Mã Hợp Đồng</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 text-white">Tên Khách Hàng</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 text-white">Tên Hàng</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 text-white">Ngày vay</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 text-white">Tiền Vay</TableHead>
                      <TableHead className="py-2 px-3 text-center font-bold border-r border-b border-gray-200 text-white">Trạng Thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loanReports.length > 0 ? (
                      loanReports.map((item, index) => (
                        <TableRow key={item.id} className="hover:bg-gray-50 transition-colors">
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            {((currentPage - 1) * itemsPerPage) + index + 1}
                          </TableCell>
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            <Link 
                              href={
                                item.type === 'Cầm đồ'
                                  ? `/pawns/${item.contractCode}`
                                  : item.type === 'Tín chấp'
                                    ? `/credits/${item.contractCode}`
                                    : `/installments/${item.contractCode}`
                              }
                              className="text-blue-600 hover:text-blue-800 underline"
                            >
                              {item.contractCode}
                            </Link>
                          </TableCell>
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            {item.customerName}
                          </TableCell>
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            {item.itemName}
                          </TableCell>
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            {item.loanDate}
                          </TableCell>
                          <TableCell className="py-2 px-3 text-center border-r border-b border-gray-200">
                            <span className="font-medium text-blue-600">{formatCurrency(item.loanAmount)}</span>
                          </TableCell>
                          <TableCell className="py-2 px-3 text-center border-b border-gray-200">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(item.statusCode)}`}>
                              {getStatusText(item.statusCode)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500 border-b border-gray-200">
                          Không có dữ liệu trong khoảng thời gian đã chọn
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter>
                    {/* Summary Row */}
                    {loanReports.length > 0 && (
                      <TableRow className="bg-yellow-50">
                        <TableCell colSpan={5} className="py-2 px-3 text-center font-bold text-lg border-r border-t border-gray-200">
                          Tổng Tiền
                        </TableCell>
                        <TableCell className="py-2 px-3 text-center font-bold text-lg border-r border-t border-gray-200 text-blue-600">
                          {formatCurrency(totalLoanAmount)}
                        </TableCell>
                        <TableCell className="py-2 px-3 border-t border-gray-200"></TableCell>
                      </TableRow>
                    )}
                  </TableFooter>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
              <div className="flex justify-center items-center space-x-2 p-4 bg-gray-50 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Button>
                
                {/* Page Numbers */}
                <div className="flex space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNumber = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    return (
                      <Button
                        key={pageNumber}
                        variant={currentPage === pageNumber ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNumber)}
                        className={currentPage === pageNumber ? "bg-blue-600 hover:bg-blue-700" : ""}
                      >
                        {pageNumber}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
