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
import { PaymentHistoryModal } from "@/components/Credits/PaymentHistoryModal";

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
  
  // State for payment history modal
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [paymentHistoryCredit, setPaymentHistoryCredit] = useState<CreditWithCustomer | null>(null);
  
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
          description: typeof error === 'object' && error !== null && 'message' in error 
            ? error.message as string 
            : "Đã xảy ra lỗi không xác định",
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

  // Handle opening payment history modal
  const handleShowPaymentHistory = (credit: CreditWithCustomer) => {
    setPaymentHistoryCredit(credit);
    setIsPaymentHistoryModalOpen(true);
  };
  
  // Handle closing payment history modal
  const handleClosePaymentHistory = () => {
    setIsPaymentHistoryModalOpen(false);
    setPaymentHistoryCredit(null);
    // Refresh data when payment history modal is closed
    loadCredits();
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
            onShowPaymentHistory={handleShowPaymentHistory}
          />
        </div>
      </div>
      
      {/* Payment History Modal */}
      {paymentHistoryCredit && (
        <PaymentHistoryModal
          isOpen={isPaymentHistoryModalOpen}
          onClose={handleClosePaymentHistory}
          credit={paymentHistoryCredit}
        />
      )}
      
    </Layout>
  );
} 