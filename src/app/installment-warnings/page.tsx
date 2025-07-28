"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { InstallmentStatus, InstallmentWithCustomer } from "@/models/installment";
import { Search, Download } from "lucide-react";
import { toast } from '@/components/ui/use-toast';
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { InstallmentWarningsTable } from "@/components/Installments/InstallmentWarningsTable";
import { getInstallmentWarnings, ReasonFilter, categorizeReason } from "@/lib/installment-warnings";
import { InstallmentWarningsPagination } from "@/components/Installments/InstallmentWarningsPagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Employee } from "@/models/employee";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { getEmployees } from "@/lib/employee";
import { useDebounce } from '@/hooks/useDebounce';
import { InstallmentPaymentHistoryModal } from "@/components/Installments/InstallmentPaymentHistoryModal";
import { makePayment } from "@/lib/installmentPayment";
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { formatCurrencyExcel } from "@/lib/utils";

export default function InstallmentWarningsPage() {
  const [installments, setInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [filteredInstallments, setFilteredInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [allFilteredWarnings, setAllFilteredWarnings] = useState<any[]>([]); // Store all filtered warnings
  const [isLoading, setIsLoading] = useState(true);
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const [contractCodeFilter, setContractCodeFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const debouncedCustomerFilter = useDebounce(customerNameFilter, 500);
  const debouncedContractFilter = useDebounce(contractCodeFilter, 500);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(30);
  const { currentStore } = useStore();
  const [processingPayment, setProcessingPayment] = useState(false);
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng trả góp
  const canViewInstallmentsList = hasPermission('xem_danh_sach_hop_dong_tra_gop');
  // Kiểm tra quyền thanh toán nhanh
  const canPayInstallment = hasPermission('dong_lai_tra_gop');
  
  const router = useRouter();
  
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithCustomer | null>(null);
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  
  // Exporting state
  const [isExporting, setIsExporting] = useState(false);
  
  // Load installments khi page load, store thay đổi, filter thay đổi hoặc trang thay đổi
  useEffect(() => {
    if (canViewInstallmentsList) {
      loadInstallments();
    }
  }, [currentStore, debouncedCustomerFilter, debouncedContractFilter, employeeFilter, canViewInstallmentsList]);
  
  useEffect(() => {
    (async () => {
      if (!currentStore?.id) return;
      const { data } = await getEmployees(1, 500, '', currentStore.id);
      setEmployees(data || []);
    })();
  }, [currentStore?.id]);
  
  async function loadInstallments() {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error, totalItems, totalPages } = await getInstallmentWarnings(
        1, // Always fetch from page 1
        1000, // Fetch all records for client-side filtering
        currentStore.id,
        debouncedCustomerFilter,
        debouncedContractFilter,
        employeeFilter === 'all' ? '' : employeeFilter
      );

      if (error) {
        toast({
          title: "Có lỗi khi tải dữ liệu hợp đồng",
          description: error,
          variant: "destructive"
        });
        return;
      }
      
      setInstallments(data || []);
      setFilteredInstallments(data || []); // This will be updated by the table component
      
    } catch (err) {
      console.error("Error in loadInstallments:", err);
      toast({
        title: "Có lỗi khi tải dữ liệu hợp đồng",
        description: "Vui lòng thử lại sau",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  // Handle quick payment
  const handlePayment = async (installment: InstallmentWithCustomer, amount: number) => {
    if (!canPayInstallment) {
      toast({
        title: "Không có quyền",
        description: "Bạn không có quyền thanh toán nhanh trả góp",
        variant: "destructive"
      });
      return;
    }
    await processPayment(installment, amount);
  };
  
  // Handle customer click to navigate to credits
  const handleCustomerClick = (installment: InstallmentWithCustomer) => {
    router.push(`/installments/${installment.contract_code}`);
  };
  
  // Handle search submit
  const handleSearch = () => {
    setCurrentPage(1); // Reset to first page when filtering
    loadInstallments();
  };
  
  // Clear filter
  const clearFilter = () => {
    setCustomerNameFilter("");
    setContractCodeFilter("");
    setEmployeeFilter("all");
    setReasonFilter("all");
    setCurrentPage(1);
  };
  
  // Handle filtered results from table component
  const handleFilteredResults = (filteredWarnings: any[]) => {
    setAllFilteredWarnings(filteredWarnings);
    
    // Calculate pagination based on filtered results
    const totalFilteredItems = filteredWarnings.length;
    const totalFilteredPages = Math.ceil(totalFilteredItems / itemsPerPage);
    
    // Update pagination state
    setTotalItems(totalFilteredItems);
    setTotalPages(totalFilteredPages);
    
    // If current page is beyond available pages, reset to page 1
    if (currentPage > totalFilteredPages && totalFilteredPages > 0) {
      setCurrentPage(1);
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle page size change
  const handlePageSizeChange = (newPageSize: number) => {
    setItemsPerPage(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };
  
  // Handle export to Excel
  const handleExportExcel = async () => {
    if (isExporting) return;

    if (!allFilteredWarnings || allFilteredWarnings.length === 0) {
      alert('Không có dữ liệu để xuất Excel');
      return;
    }

    setIsExporting(true);

    try {
      const rows = allFilteredWarnings.map((warning, index) => {
        // Format dates
        const startDateStr = warning.start_date ? format(new Date(warning.start_date), 'dd/MM/yyyy') : '';
        let endDateStr = '';
        try {
          if (warning.start_date && warning.duration) {
            const startDate = new Date(warning.start_date);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + warning.duration - 1);
            endDateStr = format(endDate, 'dd/MM/yyyy');
          }
        } catch {}

        const paymentDueDateStr = warning.payment_due_date 
          ? format(new Date(warning.payment_due_date), 'dd/MM/yyyy') 
          : '';
        
        // Calculate total amount to display
        const totalAmountToDisplay = warning.buttonValues && warning.buttonValues.length > 0 
          ? warning.buttonValues[warning.buttonValues.length - 1] 
          : 0;

        return {
          'STT': index + 1,
          'Mã hợp đồng': warning.contract_code || '',
          'Tên khách hàng': warning.customer?.name || '',
          'SĐT': warning.customer?.phone || '',
          'Địa chỉ': warning.customer?.address || '',
          'Nợ cũ': formatCurrencyExcel(warning.totalDueAmount || 0),
          'Số tiền': formatCurrencyExcel(totalAmountToDisplay),
          'Lý do': warning.reason || '',
          'Ngày vay': startDateStr,
          'Ngày kết thúc': endDateStr,
          'Ngày phải đóng': paymentDueDateStr,
          'Ghi chú': warning.notes || '',
        } as Record<string, any>;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      ws['!cols'] = [
        { width: 6 },   // STT
        { width: 15 },  // Mã hợp đồng
        { width: 20 },  // Tên khách hàng
        { width: 15 },  // SĐT
        { width: 25 },  // Địa chỉ
        { width: 15 },  // Nợ cũ
        { width: 15 },  // Số tiền
        { width: 30 },  // Lý do
        { width: 12 },  // Ngày vay
        { width: 12 },  // Ngày kết thúc
        { width: 15 },  // Ngày phải đóng
        { width: 30 },  // Ghi chú
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Cảnh báo trả góp');

      // Style header
      const headerKeys = Object.keys(rows[0] || {});
      headerKeys.forEach((_, idx) => {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: idx });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = {
            fill: { fgColor: { rgb: '4472C4' } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          } as any;
        }
      });

      const fileName = `CanhBaoTraGop_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Export Excel error', err);
      alert('Có lỗi khi xuất Excel');
    } finally {
      setIsExporting(false);
    }
  };
  
  // Process payment after confirmation
  const processPayment = async (installment: InstallmentWithCustomer, amount: number) => {
    setProcessingPayment(true);
    const { id: userId } = await getCurrentUser();
    try {
      // 1. Lấy ngày cuối cùng đã đóng tiền
      const { getLatestPaymentPaidDate } = await import('@/lib/Installments/get_latest_payment_paid_date');
      const latestPaidDate = await getLatestPaymentPaidDate(installment.id);
      
      // 2. Xác định ngày bắt đầu kỳ tiếp theo
      let nextStartDate: Date;
      if (latestPaidDate) {
        // Nếu đã có thanh toán, bắt đầu từ ngày hôm sau
        nextStartDate = new Date(latestPaidDate);
        nextStartDate.setDate(nextStartDate.getDate() + 1);
      } else {
        // Nếu chưa có thanh toán nào, bắt đầu từ ngày bắt đầu hợp đồng
        nextStartDate = new Date(installment.start_date);
      }
      
      // 3. Sử dụng getExpectedMoney và convertFromHistoryToTimeArrayWithStatus để có được periods chính xác
      const { getExpectedMoney } = await import('@/lib/Installments/get_expected_money');
      const { convertFromHistoryToTimeArrayWithStatus } = await import('@/lib/Installments/convert_from_history_to_time_array');
      const { getinstallmentPaymentHistory } = await import('@/lib/Installments/payment_history');
      
      // Lấy daily amounts và payment history
      const dailyAmounts = await getExpectedMoney(installment.id);
      const paymentHistory = await getinstallmentPaymentHistory(installment.id);
      
      // Tính loan end date
      const loanStart = new Date(installment.start_date);
      const loanEnd = new Date(loanStart);
      loanEnd.setDate(loanStart.getDate() + dailyAmounts.length - 1);
      const loanEndDate = loanEnd.toISOString().split('T')[0];
      
      // Lấy periods chính xác
      const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
        installment.start_date,
        loanEndDate,
        installment.payment_period || 10,
        paymentHistory,
        paymentHistory
      );
      
      // Tìm các kỳ chưa thanh toán để thanh toán
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const unpaidPeriods = [];
      for (let i = 0; i < timePeriods.length; i++) {
        const [startDate, endDate] = timePeriods[i];
        const periodEndDate = new Date(endDate);
        periodEndDate.setHours(0, 0, 0, 0);
        
        if (periodEndDate <= today && !statuses[i]) {
          unpaidPeriods.push({
            index: i,
            startDate,
            endDate,
            startDayIndex: Math.floor((new Date(startDate).getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24)),
            endDayIndex: Math.floor((new Date(endDate).getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24))
          });
        }
      }
      
      // Tính tổng số tiền expected cho các kỳ chưa thanh toán
      let totalExpectedAmount = 0;
      for (const period of unpaidPeriods) {
        for (let dayIndex = period.startDayIndex; dayIndex <= period.endDayIndex && dayIndex < dailyAmounts.length; dayIndex++) {
          if (dayIndex >= 0) {
            totalExpectedAmount += dailyAmounts[dayIndex];
          }
        }
      }
      
      // Tính số kỳ cần thanh toán dựa vào amount
      const numberOfPeriods = Math.min(
        Math.round(amount / (totalExpectedAmount / unpaidPeriods.length)),
        unpaidPeriods.length
      );
      
      console.log(`Processing ${numberOfPeriods} periods out of ${unpaidPeriods.length} unpaid periods`);
      
      // 4. Tạo records cho từng kỳ sử dụng periods chính xác
      const allDailyRecords = [];
      
      for (let periodIndex = 0; periodIndex < numberOfPeriods; periodIndex++) {
        const period = unpaidPeriods[periodIndex];
        const periodStartDate = new Date(period.startDate);
        const periodEndDate = new Date(period.endDate);
        
        // Tính số tiền cho kỳ này từ daily amounts
        let periodAmount = 0;
        for (let dayIndex = period.startDayIndex; dayIndex <= period.endDayIndex && dayIndex < dailyAmounts.length; dayIndex++) {
          if (dayIndex >= 0) {
            periodAmount += dailyAmounts[dayIndex];
          }
        }
        periodAmount = Math.round(periodAmount);
        
        // Tính số ngày thực tế của kỳ này
        const actualPeriodDays = Math.floor((periodEndDate.getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const dailyAmount = Math.floor(periodAmount / actualPeriodDays);
        const lastDayAdjustment = periodAmount - (dailyAmount * actualPeriodDays);
        
        console.log(`Period ${periodIndex + 1}: ${periodStartDate.toISOString().split('T')[0]} to ${periodEndDate.toISOString().split('T')[0]}, ${actualPeriodDays} days, amount: ${periodAmount}`);
        
        // 5. Tạo daily records cho kỳ này
        for (let dayOffset = 0; dayOffset < actualPeriodDays; dayOffset++) {
          const currentDate = new Date(periodStartDate);
          currentDate.setDate(periodStartDate.getDate() + dayOffset);
          
          // Determine date_status cho từng ngày trong kỳ
          let dateStatus: string | null = null;
          if (actualPeriodDays === 1) {
            dateStatus = 'only';
          } else if (dayOffset === 0) {
            dateStatus = 'start';
          } else if (dayOffset === actualPeriodDays - 1) {
            dateStatus = 'end';
          }
          // Các ngày giữa để null
          
          // Calculate amount for this day
          let dayAmount = dailyAmount;
          if (dayOffset === actualPeriodDays - 1) {
            // Last day gets the adjustment
            dayAmount = dailyAmount + lastDayAdjustment;
          }
          const transactionDate = new Date().setUTCHours(0, 0, 0, 0);
          const dailyRecord = {
            installment_id: installment.id,
            transaction_type: 'payment' as const,
            effective_date: currentDate.toISOString(),
            date_status: dateStatus,
            credit_amount: dayAmount,
            debit_amount: 0,
            description: `Thanh toán nhanh kỳ ${periodIndex + 1}/${numberOfPeriods}, ngày ${dayOffset + 1}/${actualPeriodDays}`,
            is_deleted: false,
            transaction_date: new Date(transactionDate).toISOString(),
            created_by: userId || installment.employee_id
          };

          allDailyRecords.push(dailyRecord);
        }
      }
      
      console.log(`Created ${allDailyRecords.length} daily records for ${numberOfPeriods} periods`);
      
      // 6. Insert tất cả daily records vào database
      const { error } = await supabase
        .from('installment_history')
        .insert(allDailyRecords)
        .select();
      
      if (error) {
        throw new Error(error.message);
      }

      // 7. Update payment_due_date
      const { updateInstallmentPaymentDueDate } = await import('@/lib/installment');
      
      const newLatestPaidDate = await getLatestPaymentPaidDate(installment.id);
      if (newLatestPaidDate) {
        const newLatestPaidDateObj = new Date(newLatestPaidDate);
        const contractEndDate = new Date(installment.start_date || '');
        contractEndDate.setDate(contractEndDate.getDate() + (installment.loan_period || 0) - 1);
        
        if (newLatestPaidDateObj.getTime() >= contractEndDate.getTime()) {
          await updateInstallmentPaymentDueDate(installment.id, null);
        } else {
          const newDueDate = new Date(newLatestPaidDateObj);
          newDueDate.setDate(newDueDate.getDate() + (installment.payment_period || 10));
          await updateInstallmentPaymentDueDate(installment.id, newDueDate.toISOString());
        }
      }
      
      // Success
      toast({
        title: "Thanh toán thành công",
        description: `Đã thanh toán ${amount.toLocaleString()} VND cho hợp đồng ${installment.contract_code} (${numberOfPeriods} kỳ, ${allDailyRecords.length} ngày)`,
      });
      
      // Reload installments to update the UI
      loadInstallments();
      
    } catch (err) {
      console.error("Error processing payment:", err);
      toast({
        title: "Lỗi thanh toán",
        description: err instanceof Error ? err.message : "Đã xảy ra lỗi khi xử lý thanh toán",
        variant: "destructive"
      });
    } finally {
      setProcessingPayment(false);
    }
  };
  
  const handleShowPaymentHistory = (installment: InstallmentWithCustomer) => {
    setSelectedInstallment(installment);
    setIsPaymentHistoryModalOpen(true);
  };
  
  return (
    <Layout>
      {permissionsLoading ? (
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">Đang tải...</p>
        </div>
      ) : !canViewInstallmentsList ? (
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">Bạn không có quyền xem cảnh báo trả góp</p>
        </div>
      ) : (
        <div className="max-w-full">
          {/* Title */}
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Cảnh báo trả góp</h1>
            </div>
          </div>
          
          {/* Search Filters */}
          <div className="mb-4 py-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 px-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tên khách hàng</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <Input
                    type="text"
                    placeholder="Tên khách hàng, VD: Tuấn"
                    value={customerNameFilter}
                    onChange={(e) => setCustomerNameFilter(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-10 w-full"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nhân viên</label>
                  <Select
                    value={employeeFilter}
                    onValueChange={(v) => {
                      setEmployeeFilter(v);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn nhân viên" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      {employees.map((e) => (
                        <SelectItem key={e.uid} value={e.uid}>{e.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Lý do</label>
                  <Select
                    value={reasonFilter}
                    onValueChange={(v: ReasonFilter) => {
                      setReasonFilter(v);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn lý do" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="today_due">Hôm nay phải đóng</SelectItem>
                      <SelectItem value="tomorrow_due">Ngày mai đóng</SelectItem>
                      <SelectItem value="late">Chậm kỳ</SelectItem>
                      <SelectItem value="overdue">Quá hạn</SelectItem>
                      <SelectItem value="end_today">Kết thúc hôm nay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Số mục/trang</label>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => handlePageSizeChange(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="80">80</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="flex items-end gap-2 px-4">
              <Button 
                variant="outline" 
                onClick={clearFilter}
                disabled={!customerNameFilter && !contractCodeFilter && employeeFilter==='all' && reasonFilter==='all'}
              >
                Xóa bộ lọc
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportExcel}
                disabled={isExporting || allFilteredWarnings.length === 0}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Xuất Excel
              </Button>
            </div>
          </div>
          
          <InstallmentWarningsTable
              installments={filteredInstallments}
              isLoading={isLoading}
              reasonFilter={reasonFilter}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onFilteredResults={handleFilteredResults}
              onPayment={handlePayment}
              onCustomerClick={handleCustomerClick}
              onShowPaymentHistory={handleShowPaymentHistory}
          />
          
          {/* Pagination Component */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <InstallmentWarningsPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </div>
      )}

      {selectedInstallment && (
        <InstallmentPaymentHistoryModal
          isOpen={isPaymentHistoryModalOpen}
          onClose={() => setIsPaymentHistoryModalOpen(false)}
          installment={selectedInstallment}
        />
      )}
    </Layout>
  );
} 