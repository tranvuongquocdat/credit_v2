"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { InstallmentWithCustomer } from "@/models/installment";
import { getInstallments } from "@/lib/installment";
import { InstallmentWarningsTable } from "@/components/Installments/InstallmentWarningsTable";
import { AlertTriangleIcon, Search } from "lucide-react";
import { toast } from '@/components/ui/use-toast';
import { Layout } from "@/components/Layout";
import { 
  getInstallmentPaymentPeriods, 
  createInstallmentPaymentPeriod, 
  saveInstallmentPayment
} from "@/lib/installmentPayment";
import { differenceInDays, addDays, parseISO } from 'date-fns';
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
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
import { format } from 'date-fns';

export default function InstallmentWarningsPage() {
  const [installments, setInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [filteredInstallments, setFilteredInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const { currentStore } = useStore();
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<{
    installment: InstallmentWithCustomer;
    amount: number;
    periods: number;
  } | null>(null);
  
  const router = useRouter();
  
  // Load all installments when the page loads or store changes
  useEffect(() => {
    loadInstallments();
  }, [currentStore]);
  
  // Filter installments when the customer name filter changes
  useEffect(() => {
    if (!installments.length) {
      setFilteredInstallments([]);
      return;
    }
    
    if (!customerNameFilter.trim()) {
      setFilteredInstallments(installments);
      return;
    }
    
    const filtered = installments.filter(installment => 
      installment.customer?.name?.toLowerCase().includes(customerNameFilter.toLowerCase())
    );
    
    setFilteredInstallments(filtered);
  }, [installments, customerNameFilter]);
  
  async function loadInstallments() {
    setIsLoading(true);
    try {
      // Fetch all installments (will be filtered by current store in the table component)
      const { data, error } = await getInstallments();
      
      if (error) {
        toast({
          title: "Có lỗi khi tải dữ liệu hợp đồng",
          description: error.message,
        });
        console.error("Error loading installments:", error);
        return;
      }
      
      setInstallments(data || []);
      setFilteredInstallments(data || []);
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
    // Calculate the number of periods based on the amount and period amount
    const paymentPeriod = installment.payment_period || 10;
    const amountPerPeriod = installment.installment_amount 
      ? installment.installment_amount / (installment.duration) * paymentPeriod 
      : installment.daily_amount * paymentPeriod;
    
    const numberOfPeriods = Math.round(amount / amountPerPeriod);
    
    // Store the payment info for confirmation
    setSelectedPayment({
      installment,
      amount,
      periods: numberOfPeriods
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
    const { installment, amount, periods } = selectedPayment;
    
    try {
      // Get existing payment periods
      const { data: existingPeriods, error } = await getInstallmentPaymentPeriods(installment.id);
      
      if (error) {
        throw new Error(`Error loading payment periods: ${error.toString()}`);
      }
      
      // Determine the next period start date
      let nextStartDate: Date;
      let nextPeriodNumber = 1;
      
      if (existingPeriods && existingPeriods.length > 0) {
        // Sort periods by period number
        const sortedPeriods = [...existingPeriods].sort((a, b) => a.periodNumber - b.periodNumber);
        
        // Find the highest period number
        const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
        nextPeriodNumber = lastPeriod.periodNumber + 1;
        
        // Calculate next start date based on the last period's end date
        if (lastPeriod.endDate) {
          // Parse DD/MM/YYYY format
          const [day, month, year] = lastPeriod.endDate.split('/').map(Number);
          nextStartDate = new Date(year, month - 1, day);
          // Add one day to get the next period start date
          nextStartDate = addDays(nextStartDate, 1);
        } else {
          // Fallback to contract start date
          nextStartDate = new Date(installment.start_date);
        }
      } else {
        // No existing periods, start from contract start date
        nextStartDate = new Date(installment.start_date);
      }
      
      // Calculate payment period in days
      const paymentPeriod = installment.payment_period || 10;
      
      // Calculate amount per period
      const amountPerPeriod = installment.installment_amount 
        ? installment.installment_amount / (installment.duration) * paymentPeriod 
        : installment.daily_amount * paymentPeriod;
      
      // Create periods data for the new API
      const periodsToMark = [];
      
      for (let i = 0; i < periods; i++) {
        const periodStartDate = i === 0 
          ? nextStartDate 
          : addDays(nextStartDate, i * paymentPeriod);
        
        const periodEndDate = addDays(periodStartDate, paymentPeriod - 1);
        
        // Format dates for display (DD/MM/YYYY)
        const startDateDisplay = `${String(periodStartDate.getDate()).padStart(2, '0')}/${String(periodStartDate.getMonth() + 1).padStart(2, '0')}/${periodStartDate.getFullYear()}`;
        const endDateDisplay = `${String(periodEndDate.getDate()).padStart(2, '0')}/${String(periodEndDate.getMonth() + 1).padStart(2, '0')}/${periodEndDate.getFullYear()}`;
        
        // Create period data compatible with markInstallmentPaymentPeriods
        periodsToMark.push({
          id: `temp-${nextPeriodNumber + i}`, // Temporary ID for new periods
          installmentId: installment.id,
          periodNumber: nextPeriodNumber + i,
          dueDate: startDateDisplay,
          endDate: endDateDisplay,
          paymentStartDate: format(new Date(), 'dd/MM/yyyy'),
          expectedAmount: amountPerPeriod,
          actualAmount: amountPerPeriod,
          isOverdue: false, // New periods are not overdue
          notes: `Thanh toán kỳ ${nextPeriodNumber + i} (${startDateDisplay} - ${endDateDisplay})`
        });
      }
      
      // Use the same API as PaymentTab for consistency
      const { markInstallmentPaymentPeriods } = await import('@/lib/installment-payment-api');
      
      const result = await markInstallmentPaymentPeriods(installment.id, periodsToMark, 'mark');
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to mark installment payment periods');
      }
      
      // Check if any periods had issues
      const hasErrors = result.processed_periods?.some(p => p.status === 'error');
      const autoCreatedCount = result.processed_periods?.filter(p => p.status === 'auto_created').length || 0;
      const updatedCount = result.processed_periods?.filter(p => p.status === 'updated').length || 0;
      const createdCount = result.processed_periods?.filter(p => p.status === 'created').length || 0;
      
      if (hasErrors) {
        const errorPeriods = result.processed_periods?.filter(p => p.status === 'error') || [];
        console.error('Some periods had errors:', errorPeriods);
        
        toast({
          variant: "destructive",
          title: "Một số kỳ gặp lỗi",
          description: `Có ${errorPeriods.length} kỳ không thể xử lý. Vui lòng kiểm tra lại.`,
        });
        return;
      }
      
      // Show success message with details
      let successMessage = `Đã thanh toán ${amount.toLocaleString()} VND cho hợp đồng ${installment.contract_code}`;
      const totalProcessed = (autoCreatedCount + updatedCount + createdCount);
      
      if (totalProcessed > 1) {
        successMessage += ` (${totalProcessed} kỳ)`;
      }
      
      if (autoCreatedCount > 0) {
        successMessage += ` - Tự động tạo ${autoCreatedCount} kỳ`;
      }
      
      // Success
      toast({
        title: "Thanh toán thành công",
        description: successMessage,
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
                <li><span className="font-medium">Số kỳ:</span> {selectedPayment.periods}</li>
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