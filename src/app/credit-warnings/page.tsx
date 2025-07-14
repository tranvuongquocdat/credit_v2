"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { CreditWithCustomer } from "@/models/credit";
import { getCreditWarnings, CreditReasonFilter, categorizeCreditReason } from "@/lib/credit-warnings";
import { CreditWarningsTable } from "@/components/Credits/CreditWarningsTable";
import { Search } from "lucide-react";
import { toast } from '@/components/ui/use-toast';
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaymentHistoryModal } from "@/components/Credits/PaymentHistoryModal";
import { CreditWarningsPagination } from "@/components/Credits/CreditWarningsPagination";
import { usePermissions } from "@/hooks/usePermissions";
import { useDebounce } from '@/hooks/useDebounce';
import { useCreditCalculations } from "@/hooks/useCreditCalculation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export default function CreditWarningPage() {
  const [allCredits, setAllCredits] = useState<CreditWithCustomer[]>([]);
  const [filteredCredits, setFilteredCredits] = useState<CreditWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState<CreditReasonFilter>("all");
  
  const debouncedCustomerFilter = useDebounce(customerNameFilter, 500);
  const { currentStore } = useStore();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 30;
  
  // State for payment history modal
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [paymentHistoryCredit, setPaymentHistoryCredit] = useState<CreditWithCustomer | null>(null);

  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng trả góp
  const canViewCreditWarnings = hasPermission('xem_danh_sach_hop_dong_tin_chap');
  
  // Get credit calculations
  const { details: creditCalculations, loading: calculationsLoading } = useCreditCalculations();
  
  // Load credits when the page loads, store changes, or filter changes
  useEffect(() => {
    if (canViewCreditWarnings && currentStore?.id) {
      loadCredits();
    }
  }, [currentStore, debouncedCustomerFilter, canViewCreditWarnings]);
  
  async function loadCredits() {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await getCreditWarnings(
        1, // Always fetch from page 1
        1000, // Fetch all records for client-side filtering
        currentStore.id,
        debouncedCustomerFilter,
      );
      
      if (error) {
        toast({
          title: "Có lỗi khi tải dữ liệu hợp đồng",
          description: typeof error === 'string' ? error : "Đã xảy ra lỗi không xác định",
        });
        console.error("Error loading credit warnings:", error);
        return;
      }
      
      setAllCredits(data || []);
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
  
  // Client-side filtering effect
  useEffect(() => {
    // Apply reason filtering
    const filteredResults = reasonFilter === "all" 
      ? allCredits.filter(credit => {
          const reasonCategories = categorizeCreditReason(credit.reason || '');
          return !reasonCategories.includes("tomorrow_due"); // Exclude tomorrow from "all"
        })
      : allCredits.filter(credit => {
          const reasonCategories = categorizeCreditReason(credit.reason || '');
          return reasonCategories.includes(reasonFilter);
        });
    
    // Update totals
    setTotalItems(filteredResults.length);
    setTotalPages(Math.ceil(filteredResults.length / itemsPerPage));
    
    // Apply client-side pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedResults = filteredResults.slice(startIndex, endIndex);
    
    setFilteredCredits(paginatedResults);
  }, [allCredits, reasonFilter, currentPage, itemsPerPage]);

  // Handle opening payment history modal
  const handleShowPaymentHistory = (credit: CreditWithCustomer) => {
    setPaymentHistoryCredit(credit);
    setIsPaymentHistoryModalOpen(true);
  };
  
  // Handle closing payment history modal
  const handleClosePaymentHistory = (hasDataChanged?: boolean) => {
    setIsPaymentHistoryModalOpen(false);
    setPaymentHistoryCredit(null);
    // Only refresh data if there were actual changes
    if (hasDataChanged) {
      loadCredits();
    }
  };
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Handle filter changes
  const handleCustomerFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerNameFilter(e.target.value);
    setCurrentPage(1);
  };
  
  const handleReasonFilterChange = (value: CreditReasonFilter) => {
    setReasonFilter(value);
    setCurrentPage(1);
  };
  
  // Handle filter clear
  const handleClearFilter = () => {
    setCustomerNameFilter("");
    setReasonFilter("all");
    setCurrentPage(1);
  };
  
  return (
    <Layout>
      {permissionsLoading ? (
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">Đang tải...</p>
        </div>
      ) : !canViewCreditWarnings ? (
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">Bạn không có quyền xem cảnh báo tín chấp</p>
        </div>
      ) : (
      <>
      <div className="container mx-auto">
        {/* Title */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Cảnh báo tín chấp</h1>
          </div>
        </div>
        
        {/* Enhanced Filter Section */}
        <div className="my-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Customer Name Filter */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <Input
                type="text"
                placeholder="Tìm theo tên khách hàng..."
                value={customerNameFilter}
                onChange={handleCustomerFilterChange}
                className="pl-10"
              />
            </div>
            
            {/* Reason Filter */}
            <Select value={reasonFilter} onValueChange={handleReasonFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Lọc theo lý do" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="today_due">Hôm nay đóng</SelectItem>
                <SelectItem value="tomorrow_due">Ngày mai đóng</SelectItem>
                <SelectItem value="late">Chậm trả lãi</SelectItem>
                <SelectItem value="overdue">Quá hạn hợp đồng</SelectItem>
                <SelectItem value="end_today">Kết thúc hôm nay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Clear Filter Button */}
          <div className="mt-4 flex justify-between items-center">
            <Button 
              variant="outline" 
              onClick={handleClearFilter}
              disabled={!customerNameFilter && reasonFilter === "all"}
            >
              Xóa bộ lọc
            </Button>
            
            {/* Show filter info */}
            <div className="text-sm text-blue-600">
              {totalItems > 0 ? 
                `Hiển thị ${totalItems} hợp đồng` : 
                "Không có kết quả"}
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <CreditWarningsTable
            credits={filteredCredits}
            isLoading={isLoading || calculationsLoading}
            onShowPaymentHistory={handleShowPaymentHistory}
            creditCalculations={creditCalculations}
          />
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <CreditWarningsPagination
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
      
      {/* Payment History Modal */}
      {paymentHistoryCredit && (
        <PaymentHistoryModal
          isOpen={isPaymentHistoryModalOpen}
          onClose={handleClosePaymentHistory}
          credit={paymentHistoryCredit}
        />
      )}
      </>
      )}
    </Layout>
  );
} 