"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { InstallmentWithCustomer } from "@/models/installment";
import { getInstallments } from "@/lib/installment";
import { InstallmentWarningsTable } from "@/components/Installments/InstallmentWarningsTable";
import { AlertTriangleIcon } from "lucide-react";
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

export default function InstallmentWarningsPage() {
  const [installments, setInstallments] = useState<InstallmentWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentStore } = useStore();
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<{
    installment: InstallmentWithCustomer;
    amount: number;
    periods: number;
  } | null>(null);
  
  // Load all installments when the page loads or store changes
  useEffect(() => {
    loadInstallments();
  }, [currentStore]);
  
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
      
      // Create payment records for each period
      const paymentPromises = [];
      
      for (let i = 0; i < periods; i++) {
        const periodStartDate = i === 0 
          ? nextStartDate 
          : addDays(nextStartDate, i * paymentPeriod);
        
        const periodEndDate = addDays(periodStartDate, paymentPeriod - 1);
        
        // Format dates to store in DB (YYYY-MM-DD)
        const startDateFormatted = `${periodStartDate.getFullYear()}-${String(periodStartDate.getMonth() + 1).padStart(2, '0')}-${String(periodStartDate.getDate()).padStart(2, '0')}`;
        
        const endDateFormatted = `${periodEndDate.getFullYear()}-${String(periodEndDate.getMonth() + 1).padStart(2, '0')}-${String(periodEndDate.getDate()).padStart(2, '0')}`;
        
        // Format for display (DD/MM/YYYY)
        const startDateDisplay = `${String(periodStartDate.getDate()).padStart(2, '0')}/${String(periodStartDate.getMonth() + 1).padStart(2, '0')}/${periodStartDate.getFullYear()}`;
        const endDateDisplay = `${String(periodEndDate.getDate()).padStart(2, '0')}/${String(periodEndDate.getMonth() + 1).padStart(2, '0')}/${periodEndDate.getFullYear()}`;
        
        // Create the payment record
        const today = new Date();
        const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        const periodParams = {
          installment_id: installment.id,
          period_number: nextPeriodNumber + i,
          date: startDateFormatted,
          payment_end_date: endDateFormatted,
          expected_amount: amountPerPeriod,
          actual_amount: amountPerPeriod, // Set actual amount equal to expected (fully paid)
          payment_start_date: todayFormatted, // Payment made today
          notes: `Thanh toán kỳ ${nextPeriodNumber + i} (${startDateDisplay} - ${endDateDisplay})`
        };
        
        // Add to promises array
        paymentPromises.push(createInstallmentPaymentPeriod(periodParams));
      }
      
      // Execute all payment creations
      const results = await Promise.all(paymentPromises);
      
      // Check for errors
      const errors = results.filter(result => result.error).map(result => result.error);
      
      if (errors.length > 0) {
        throw new Error(`Có lỗi khi tạo ${errors.length} kỳ thanh toán`);
      }
      
      // Success
      toast({
        title: "Thanh toán thành công",
        description: `Đã thanh toán ${amount.toLocaleString()} VND cho ${periods} kỳ của hợp đồng ${installment.contract_code}`,
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
      <div className="container mx-auto p-4">
        {/* Title */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý hợp đồng trả góp</h1>
          </div>
        </div>
        <div className="mt-6">
          <InstallmentWarningsTable
            installments={installments}
            isLoading={isLoading}
            onPayment={handlePayment}
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