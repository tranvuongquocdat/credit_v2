"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { CreditWithCustomer, CreditStatus } from "@/models/credit";
import { getCredits } from "@/lib/credit";
import { CreditWarningsTable } from "@/components/Credits/CreditWarningsTable";
import { AlertTriangleIcon, Search } from "lucide-react";
import { toast } from '@/components/ui/use-toast';
import { Layout } from "@/components/Layout";
import { 
  getCreditPaymentPeriods, 
  createPaymentPeriod, 
  savePaymentWithOtherAmount
} from "@/lib/credit-payment";
import { differenceInDays, addDays, parseISO } from 'date-fns';
import { CreditPaymentPeriod } from "@/models/credit-payment";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CreditWarningPage() {
  const [credits, setCredits] = useState<CreditWithCustomer[]>([]);
  const [filteredCredits, setFilteredCredits] = useState<CreditWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const { currentStore } = useStore();
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<{
    credit: CreditWithCustomer;
    amount: number;
    periods: number;
  } | null>(null);
  
  // Load all credits when the page loads or store changes
  useEffect(() => {
    loadCredits();
  }, [currentStore]);
  
  // Filter credits when the customer name filter changes
  useEffect(() => {
    if (!credits.length) {
      setFilteredCredits([]);
      return;
    }
    
    if (!customerNameFilter.trim()) {
      setFilteredCredits(credits);
      return;
    }
    
    const filtered = credits.filter(credit => 
      credit.customer?.name?.toLowerCase().includes(customerNameFilter.toLowerCase())
    );
    
    setFilteredCredits(filtered);
  }, [credits, customerNameFilter]);
  
  async function loadCredits() {
    setIsLoading(true);
    try {
      // Fetch all credits (will be filtered by current store in the table component)
      const { data, error } = await getCredits(1, 1000);
      
      if (error) {
        toast({
          title: "Có lỗi khi tải dữ liệu hợp đồng",
          description: error.message,
        });
        console.error("Error loading credits:", error);
        return;
      }
      
      setCredits(data || []);
      setFilteredCredits(data || []);
    } catch (err) {
      console.error("Error in loadCredits:", err);
      toast({
        title: "Có lỗi khi tải dữ liệu hợp đồng",
        description: "Vui lòng thử lại sau",
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  // Handle quick payment
  const handlePayment = async (credit: CreditWithCustomer, amount: number) => {
    // Calculate the number of periods based on the amount and period amount
    const interestPeriod = credit.interest_period || 10;
    
    // Calculate interest per period based on loan amount and interest value
    let interestPerPeriod = 0;
    
    // Using different calculation based on interest_ui_type and interest_notation
    if (credit.interest_ui_type === 'daily' && credit.interest_notation === 'k_per_million') {
      // daily interest in k per million
      interestPerPeriod = (credit.loan_amount / 1000000) * credit.interest_value * interestPeriod;
    } else if (credit.interest_ui_type === 'monthly_30' || credit.interest_ui_type === 'monthly_custom') {
      // monthly interest in percentage
      interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 30);
    } else if (credit.interest_ui_type === 'weekly_percent') {
      // weekly interest in percentage
      interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 7);
    } else if (credit.interest_ui_type === 'weekly_k') {
      // fixed weekly amount in k
      interestPerPeriod = credit.interest_value * 1000 * (interestPeriod / 7);
    }
    
    const numberOfPeriods = Math.round(amount / interestPerPeriod);
    
    // Store the payment info for confirmation
    setSelectedPayment({
      credit,
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
    const { credit, amount, periods } = selectedPayment;
    
    try {
      // Get existing payment periods
      const { data: existingPeriods, error } = await getCreditPaymentPeriods(credit.id);
      
      if (error) {
        throw new Error(`Error loading payment periods: ${error.toString()}`);
      }
      
      // Determine the next period start date
      let nextStartDate: Date;
      let nextPeriodNumber = 1;
      
      if (existingPeriods && existingPeriods.length > 0) {
        // Sort periods by period number
        const sortedPeriods = [...existingPeriods].sort((a, b) => a.period_number - b.period_number);
        
        // Find the highest period number
        const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
        nextPeriodNumber = lastPeriod.period_number + 1;
        
        // Calculate next start date based on the last period's end date
        if (lastPeriod.end_date) {
          // Handle different date formats
          let endDate: Date;
          if (lastPeriod.end_date.includes('-')) {
            // YYYY-MM-DD format
            endDate = new Date(lastPeriod.end_date);
          } else if (lastPeriod.end_date.includes('/')) {
            // DD/MM/YYYY format
            const [day, month, year] = lastPeriod.end_date.split('/').map(Number);
            endDate = new Date(year, month - 1, day);
          } else {
            // Fallback to today
            endDate = new Date();
          }
          
          // Add one day to get the next period start date
          nextStartDate = addDays(endDate, 1);
        } else {
          // Fallback to contract start date
          nextStartDate = new Date(credit.loan_date);
        }
      } else {
        // No existing periods, start from contract start date
        nextStartDate = new Date(credit.loan_date);
      }
      
      // Calculate payment period in days
      const interestPeriod = credit.interest_period || 10;
      
      // Calculate interest per period based on loan amount and interest value
      let interestPerPeriod = 0;
      
      // Using different calculation based on interest_ui_type and interest_notation
      if (credit.interest_ui_type === 'daily' && credit.interest_notation === 'k_per_million') {
        // daily interest in k per million
        interestPerPeriod = (credit.loan_amount / 1000000) * credit.interest_value * interestPeriod;
      } else if (credit.interest_ui_type === 'monthly_30' || credit.interest_ui_type === 'monthly_custom') {
        // monthly interest in percentage
        interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 30);
      } else if (credit.interest_ui_type === 'weekly_percent') {
        // weekly interest in percentage
        interestPerPeriod = (credit.loan_amount * credit.interest_value / 100) * (interestPeriod / 7);
      } else if (credit.interest_ui_type === 'weekly_k') {
        // fixed weekly amount in k
        interestPerPeriod = credit.interest_value * 1000 * (interestPeriod / 7);
      }
      
      // Create payment records for each period
      const paymentPromises = [];
      
      for (let i = 0; i < periods; i++) {
        const periodStartDate = i === 0 
          ? nextStartDate 
          : addDays(nextStartDate, i * interestPeriod);
        
        const periodEndDate = addDays(periodStartDate, interestPeriod - 1);
        
        // Format dates to store in DB (YYYY-MM-DD)
        const startDateFormatted = `${periodStartDate.getFullYear()}-${String(periodStartDate.getMonth() + 1).padStart(2, '0')}-${String(periodStartDate.getDate()).padStart(2, '0')}`;
        
        const endDateFormatted = `${periodEndDate.getFullYear()}-${String(periodEndDate.getMonth() + 1).padStart(2, '0')}-${String(periodEndDate.getDate()).padStart(2, '0')}`;
        
        // Format for display (DD/MM/YYYY)
        const startDateDisplay = `${String(periodStartDate.getDate()).padStart(2, '0')}/${String(periodStartDate.getMonth() + 1).padStart(2, '0')}/${periodStartDate.getFullYear()}`;
        const endDateDisplay = `${String(periodEndDate.getDate()).padStart(2, '0')}/${String(periodEndDate.getMonth() + 1).padStart(2, '0')}/${periodEndDate.getFullYear()}`;
        
        // Create the payment record
        const today = new Date();
        const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        const periodData = {
          credit_id: credit.id,
          period_number: nextPeriodNumber + i,
          start_date: startDateFormatted,
          end_date: endDateFormatted,
          expected_amount: interestPerPeriod,
          actual_amount: interestPerPeriod, // Set actual amount equal to expected (fully paid)
          payment_date: todayFormatted, // Payment made today
          notes: `Thanh toán kỳ ${nextPeriodNumber + i} (${startDateDisplay} - ${endDateDisplay})`
        };
        
        // Use savePaymentWithOtherAmount to handle both creation and updates
        paymentPromises.push(savePaymentWithOtherAmount(
          credit.id,
          periodData,
          interestPerPeriod, // actual amount
          0, // no other amount
          true // is calculated period
        ));
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
        description: `Đã thanh toán ${amount.toLocaleString()} VND cho ${periods} kỳ của hợp đồng ${credit.contract_code}`,
      });
      
      // Reload credits to update the UI
      loadCredits();
      
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
            <h1 className="text-lg font-bold">Cảnh báo vay tiền</h1>
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
              {filteredCredits.length > 0 ? 
                ` (${filteredCredits.length} kết quả)` : 
                " (Không có kết quả)"}
            </div>
          )}
        </div>
        
        <div className="mt-6">
          <CreditWarningsTable
            credits={filteredCredits}
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
                <li><span className="font-medium">Hợp đồng:</span> {selectedPayment.credit.contract_code}</li>
                <li><span className="font-medium">Khách hàng:</span> {selectedPayment.credit.customer?.name}</li>
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