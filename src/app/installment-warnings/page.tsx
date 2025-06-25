"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { InstallmentStatus, InstallmentWithCustomer } from "@/models/installment";
import { Search } from "lucide-react";
import { toast } from '@/components/ui/use-toast';
import { Layout } from "@/components/Layout";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { InstallmentWarningsTable } from "@/components/Installments/InstallmentWarningsTable";
import { getInstallmentWarnings } from "@/lib/installment-warnings";
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

export default function InstallmentWarningsPage() {
  const [installments, setInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const debouncedCustomerFilter = useDebounce(customerNameFilter, 500);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(30);
  const { currentStore } = useStore();
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<{
    installment: InstallmentWithCustomer;
    amount: number;
  } | null>(null);
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng trả góp
  const canViewInstallmentsList = hasPermission('xem_danh_sach_hop_dong_tra_gop');
  // Kiểm tra quyền thanh toán nhanh
  const canPayInstallment = hasPermission('dong_lai_tra_gop');
  
  const router = useRouter();
  
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  // Load installments khi page load, store thay đổi, filter thay đổi hoặc trang thay đổi
  useEffect(() => {
    if (canViewInstallmentsList) {
      loadInstallments();
    }
  }, [currentStore, debouncedCustomerFilter, employeeFilter, currentPage, canViewInstallmentsList]);
  
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
        currentPage,
        itemsPerPage,
        currentStore.id,
        debouncedCustomerFilter,
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
      setTotalItems(totalItems);
      setTotalPages(totalPages);
      
      console.log(`Loaded ${data.length} installments out of ${totalItems} total (page ${currentPage}/${totalPages})`);
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
    // Store the payment info for confirmation
    setSelectedPayment({
      installment,
      amount,
    });
    
    // Open confirmation dialog
    setPaymentConfirmOpen(true);
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
    setEmployeeFilter("all");
    setCurrentPage(1);
  };
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Process payment after confirmation
  const processPayment = async () => {
    if (!selectedPayment) return;
    
    setProcessingPayment(true);
    const { installment, amount } = selectedPayment;
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
      setPaymentConfirmOpen(false);
      setSelectedPayment(null);
    }
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
        <div className="container mx-auto">
          {/* Title */}
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Cảnh báo trả góp</h1>
            </div>
          </div>
          
          {/* Filter Section */}
          <div className="my-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Tìm kiếm theo tên khách hàng..."
                  value={customerNameFilter}
                  onChange={(e) => setCustomerNameFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              {/* Employee Select */}
              <div className="max-w-xs">
                <Select
                  value={employeeFilter}
                  onValueChange={(v) => {
                    setEmployeeFilter(v);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Nhân viên" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả NV</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.uid} value={e.uid}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="outline" 
                onClick={clearFilter}
                disabled={!customerNameFilter && employeeFilter==='all'}
              >
                Xóa bộ lọc
              </Button>
            </div>
            {/* Show filter info if active */}
            {customerNameFilter && (
              <div className="mt-2 text-sm text-blue-600">
                Đang lọc theo tên khách hàng: <span className="font-semibold">{customerNameFilter}</span>
                {totalItems > 0 ? 
                  ` (${totalItems} kết quả)` : 
                  " (Không có kết quả)"}
              </div>
            )}
          </div>
          
          <div className="mt-6">
            <InstallmentWarningsTable
              installments={installments}
              isLoading={isLoading}
              onPayment={handlePayment}
              onCustomerClick={handleCustomerClick}
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
        </div>
      )}
      
      {/* Payment Confirmation Dialog */}
      <Dialog open={paymentConfirmOpen} onOpenChange={setPaymentConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận thanh toán</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="py-4">
              <p className="mb-2">Bạn có chắc chắn muốn thanh toán:</p>
              <ul className="list-disc pl-5 mb-4 space-y-1">
                <li><span className="font-medium">Hợp đồng:</span> {selectedPayment.installment.contract_code}</li>
                <li><span className="font-medium">Khách hàng:</span> {selectedPayment.installment.customer?.name}</li>
                <li><span className="font-medium">Số tiền:</span> {selectedPayment.amount.toLocaleString()} VND</li>
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setPaymentConfirmOpen(false)} 
              disabled={processingPayment}
            >
              Huỷ
            </Button>
            <Button 
              onClick={processPayment} 
              disabled={processingPayment}
              className="bg-green-600 hover:bg-green-700"
            >
              {processingPayment ? "Đang xử lý..." : "Xác nhận thanh toán"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
} 