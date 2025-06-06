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
    
    return installments.filter(installment => 
      installment.customer?.name?.toLowerCase().includes(customerNameFilter.toLowerCase())
    );
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
      
      // 3. Tính toán số kỳ cần đóng dựa vào amount
      const paymentPeriod = installment.payment_period || 10;
      const amountPerPeriod = installment.installment_amount 
        ? installment.installment_amount / (installment.duration / paymentPeriod)
        : amount; // fallback
      
      const numberOfPeriods = Math.round(amount / amountPerPeriod);
      
      console.log(`Processing ${numberOfPeriods} periods, ${paymentPeriod} days each`);
      
      // 4. Tạo records cho từng kỳ
      const allDailyRecords = [];
      
      for (let periodIndex = 0; periodIndex < numberOfPeriods; periodIndex++) {
        // Tính ngày bắt đầu và kết thúc của kỳ này
        const periodStartDate = new Date(nextStartDate);
        periodStartDate.setDate(nextStartDate.getDate() + (periodIndex * paymentPeriod));
        
        const periodEndDate = new Date(periodStartDate);
        periodEndDate.setDate(periodStartDate.getDate() + paymentPeriod - 1);
        
        // Tính số tiền cho kỳ này
        const periodAmount = Math.round(amountPerPeriod);
        const dailyAmount = Math.floor(periodAmount / paymentPeriod);
        const lastDayAdjustment = periodAmount - (dailyAmount * paymentPeriod);
        
        console.log(`Period ${periodIndex + 1}: ${periodStartDate.toISOString().split('T')[0]} to ${periodEndDate.toISOString().split('T')[0]}, amount: ${periodAmount}`);
        
        // 5. Tạo daily records cho kỳ này
        for (let dayOffset = 0; dayOffset < paymentPeriod; dayOffset++) {
          const currentDate = new Date(periodStartDate);
          currentDate.setDate(periodStartDate.getDate() + dayOffset);
          
          // Determine date_status cho từng ngày trong kỳ
          let dateStatus: string | null = null;
          if (paymentPeriod === 1) {
            dateStatus = 'only';
          } else if (dayOffset === 0) {
            dateStatus = 'start';
          } else if (dayOffset === paymentPeriod - 1) {
            dateStatus = 'end';
          }
          // Các ngày giữa để null
          
          // Calculate amount for this day
          let dayAmount = dailyAmount;
          if (dayOffset === paymentPeriod - 1) {
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
            description: `Thanh toán nhanh kỳ ${periodIndex + 1}/${numberOfPeriods}, ngày ${dayOffset + 1}/${paymentPeriod}`,
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
          newDueDate.setDate(newDueDate.getDate() + installment.payment_period);
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