"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { CreditWithCustomer } from "@/models/credit";
import { getCreditWarnings } from "@/lib/credit-warnings";
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

export default function CreditWarningPage() {
  const [credits, setCredits] = useState<CreditWithCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const debouncedCustomerFilter = useDebounce(customerNameFilter, 500);
  const { currentStore } = useStore();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;
  
  // State for payment history modal
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false);
  const [paymentHistoryCredit, setPaymentHistoryCredit] = useState<CreditWithCustomer | null>(null);

  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // Kiểm tra quyền xem danh sách hợp đồng trả góp
  const canViewCreditWarnings = hasPermission('xem_danh_sach_hop_dong_tin_chap');
  // Load credits when the page loads, store changes, or pagination/filter changes
  useEffect(() => {
    if (currentStore?.id) {
      loadCredits();
    }
  }, [currentStore, currentPage, debouncedCustomerFilter]);
  
  async function loadCredits() {
    if (!currentStore?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error, totalItems: total, totalPages: pages } = await getCreditWarnings(
        currentPage,
        itemsPerPage,
        currentStore.id,
        debouncedCustomerFilter
      );
      
      if (error) {
        toast({
          title: "Có lỗi khi tải dữ liệu hợp đồng",
          description: typeof error === 'string' ? error : "Đã xảy ra lỗi không xác định",
        });
        console.error("Error loading credit warnings:", error);
        return;
      }
      
      setCredits(data || []);
      setTotalItems(total || 0);
      setTotalPages(pages || 1);
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
  
  // Handle filter change
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerNameFilter(e.target.value);
    setCurrentPage(1); // Reset to first page when filter changes
  };
  
  // Handle filter clear
  const handleClearFilter = () => {
    setCustomerNameFilter("");
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
                onChange={handleFilterChange}
                className="pl-10"
              />
            </div>
            <Button 
              variant="outline" 
              onClick={handleClearFilter}
              disabled={!customerNameFilter}
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
          <CreditWarningsTable
            credits={credits}
            isLoading={isLoading}
            onShowPaymentHistory={handleShowPaymentHistory}
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