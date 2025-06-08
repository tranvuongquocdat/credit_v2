"use client";

import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/contexts/StoreContext";
import { InstallmentStatus, InstallmentWithCustomer } from "@/models/installment";
import { getInstallments } from "@/lib/installment";
import { InstallmentWarningsTable } from "@/components/Installments/InstallmentWarningsTable";
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
import { getLatestPaymentPaidDate } from "@/lib/Installments/get_latest_payment_paid_date";
import { supabase } from "@/lib/supabase";

export default function InstallmentWarningsPage() {
  const [installments, setInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const { currentStore } = useStore();
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<{
    installment: InstallmentWithCustomer;
    amount: number;
  } | null>(null);
  
  const router = useRouter();
  
  // Sử dụng useMemo để tính toán filtered data
  const filteredInstallments = useMemo(() => {
    if (!installments.length) return [];
    
    if (!customerNameFilter.trim()) {
      return installments;
    }
    
    console.log('Filtering with customerNameFilter:', customerNameFilter);
    
    return installments.filter(installment => {
      const customerName = installment.customer?.name?.toLowerCase() || '';
      const filterText = customerNameFilter.toLowerCase();
      const shouldInclude = customerName.includes(filterText);
      
      console.log(`Contract ${installment.contract_code}: customerName="${customerName}", filter="${filterText}", include=${shouldInclude}`);
      
      return shouldInclude;
    });
  }, [installments, customerNameFilter]);
  
  // Load installments khi page load hoặc store thay đổi
  useEffect(() => {
    loadInstallments();
  }, [currentStore]);
  
  async function loadInstallments() {
    setIsLoading(true);
    try {
      const { data, error } = await getInstallments(1,10, {
        status: InstallmentStatus.ON_TIME,
        store_id: currentStore?.id || '',
      });

      // lấy ra ngày cuối cùng đóng tiền của từng hợp đồng qua getLatestPaymentPaidDate
      const latestPaymentPaidDate = await Promise.all(data.map(async (installment) => {
        return {
          ...installment,
          latestPaymentPaidDate: await getLatestPaymentPaidDate(installment.id)
        };
      }));

      // nếu nhỏ hơn bằng hôm nay ( có giá trị trả về ), hoặc start_date nhỏ hơn bằng hôm nay ( nếu null) => cảnh báo
      const warningInstallments = latestPaymentPaidDate.filter(installment => {
        if (installment.latestPaymentPaidDate) {
          return new Date(installment.latestPaymentPaidDate) <= new Date();
        }
        return new Date(installment.start_date) <= new Date();
      });
      
      if (error) {
        toast({
          title: "Có lỗi khi tải dữ liệu hợp đồng",
          description: error.message,
        });
        return;
      }
      
      setInstallments(warningInstallments || []);
    } catch (err) {
      console.error("Error in loadInstallments:", err);
      toast({
        title: "Có lỗi khi tải dữ liệu hợp đồng",
        description: "Vui lòng thử lại sau",
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  // Handle quick payment
  const handlePayment = async (installment: InstallmentWithCustomer, amount: number) => {
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
    router.push(`/installments?contract=${installment.contract_code}`);
  };
  
  // Process payment after confirmation
  const processPayment = async () => {
    if (!selectedPayment) return;
    
    setProcessingPayment(true);
    const { installment, amount } = selectedPayment;
    
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
          
          const dailyRecord = {
            installment_id: installment.id,
            transaction_type: 'payment' as const,
            effective_date: currentDate.toISOString(),
            date_status: dateStatus,
            credit_amount: dayAmount,
            debit_amount: 0,
            description: `Thanh toán nhanh kỳ ${periodIndex + 1}/${numberOfPeriods}, ngày ${dayOffset + 1}/${actualPeriodDays}`,
            employee_id: installment.employee_id,
            is_deleted: false,
            transaction_date: new Date().toISOString()
          };

          allDailyRecords.push(dailyRecord);
        }
      }
      
      console.log(`Created ${allDailyRecords.length} daily records for ${numberOfPeriods} periods`);
      
      // 6. Insert tất cả daily records vào database
      const { data, error } = await supabase
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
                className="pl-10"
              />
            </div>
            <Button 
              variant="outline" 
              onClick={() => setCustomerNameFilter("")}
              disabled={!customerNameFilter}
            >
              Xóa bộ lọc
            </Button>
          </div>
          {/* Show filter info if active */}
          {customerNameFilter && (
            <div className="mt-2 text-sm text-blue-600">
              Đang lọc theo tên khách hàng: <span className="font-semibold">{customerNameFilter}</span>
              {filteredInstallments.length > 0 ? 
                ` (${filteredInstallments.length} kết quả)` : 
                " (Không có kết quả)"}
            </div>
          )}
        </div>
        
        <div className="mt-6">
          <InstallmentWarningsTable
            installments={filteredInstallments}
            isLoading={isLoading}
            onPayment={handlePayment}
            onCustomerClick={handleCustomerClick}
          />
        </div>
      </div>
      
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