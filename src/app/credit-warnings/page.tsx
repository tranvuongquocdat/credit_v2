"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/contexts/StoreContext";
import { CreditWithCustomer } from "@/models/credit";
import { getCreditWarnings, CreditReasonFilter, categorizeCreditReason, calculateUnpaidInterestAmount } from "@/lib/credit-warnings";
import { CreditWarningsTable } from "@/components/Credits/CreditWarningsTable";
import { Search, Download } from "lucide-react";
import { toast } from '@/components/ui/use-toast';
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaymentHistoryModal } from "@/components/Credits/PaymentHistoryModal";
import { CreditWarningsPagination } from "@/components/Credits/CreditWarningsPagination";
import { usePermissions } from "@/hooks/usePermissions";
import { useDebounce } from '@/hooks/useDebounce';
import { useCreditCalculations } from "@/hooks/useCreditCalculation";
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { formatCurrencyExcel } from "@/lib/utils";
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
  const [isExporting, setIsExporting] = useState(false);
  
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
          const matches = reasonCategories.includes(reasonFilter);
          
          if (reasonFilter === "late") {
            console.log(`[Credit Warnings Filter] Credit ${credit.id}:`, {
              reason: credit.reason,
              reasonCategories,
              matches
            });
          }
          
          return matches;
        });
    
    console.log(`[Credit Warnings Filter] Filtered results: ${filteredResults.length}`);
    
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

  // Handle Excel export
  const handleExportExcel = async () => {
    if (allCredits.length === 0) {
      toast({
        title: "Không có dữ liệu để xuất",
        description: "Vui lòng thử lại sau khi có dữ liệu",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      // Get filtered credits for export
      const exportCredits = reasonFilter === "all" 
        ? allCredits.filter(credit => {
            const reasonCategories = categorizeCreditReason(credit.reason || '');
            return !reasonCategories.includes("tomorrow_due");
          })
        : allCredits.filter(credit => {
            const reasonCategories = categorizeCreditReason(credit.reason || '');
            return reasonCategories.includes(reasonFilter);
          });

      // Calculate enhanced data for export
      const enhancedExportCredits = exportCredits.map(credit => {
        const creditDetails = creditCalculations?.[credit.id];
        const latestPaidDate = creditDetails?.latestPaidDate || null;
        
        // Calculate unpaid interest amount
        const totalInterest = calculateUnpaidInterestAmount(credit, latestPaidDate);
        
        return {
          ...credit,
          totalInterest,
          totalAmount: (credit.loan_amount || 0) + totalInterest
        };
      });

      // Prepare data for Excel
      const excelData = enhancedExportCredits.map((credit, index) => ({
        'STT': index + 1,
        'Mã hợp đồng': credit.contract_code || '',
        'Tên khách hàng': credit.customer?.name || '',
        'Số điện thoại': credit.customer?.phone || '',
        'Địa chỉ': credit.address || '',
        'Tiền gốc': formatCurrencyExcel(credit.loan_amount || 0),
        'Tổng tiền lãi': formatCurrencyExcel(credit.totalInterest || 0),
        'Tổng tiền': formatCurrencyExcel(credit.totalAmount || 0),
        'Lý do': credit.reason || '',
        'Ngày vay': credit.loan_date ? format(new Date(credit.loan_date), 'dd/MM/yyyy') : '',
        'Ngày đóng tiếp': credit.next_payment_date ? format(new Date(credit.next_payment_date), 'dd/MM/yyyy') : ''
      }));

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const colWidths = [
        { wch: 5 },   // STT
        { wch: 15 },  // Mã hợp đồng
        { wch: 25 },  // Tên khách hàng
        { wch: 15 },  // Số điện thoại
        { wch: 30 },  // Địa chỉ
        { wch: 15 },  // Tiền gốc
        { wch: 15 },  // Tổng tiền lãi
        { wch: 15 },  // Tổng tiền
        { wch: 25 },  // Lý do
        { wch: 12 },  // Ngày vay
        { wch: 12 }   // Ngày đóng tiếp
      ];
      ws['!cols'] = colWidths;

      // Style the header row
      const headerStyle = {
        fill: { fgColor: { rgb: "4472C4" } },
        font: { color: { rgb: "FFFFFF" }, bold: true },
        alignment: { horizontal: "center", vertical: "center" }
      };

      // Apply header styling
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!ws[cellAddress]) continue;
        ws[cellAddress].s = headerStyle;
      }

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Cảnh báo tín chấp');

      // Generate filename with timestamp
      const timestamp = format(new Date(), 'dd-MM-yyyy_HH-mm-ss');
      const filename = `CanhBaoTinChap_${timestamp}.xlsx`;

      // Write and download file
      XLSX.writeFile(wb, filename);

      toast({
        title: "Xuất Excel thành công",
        description: `Đã xuất ${excelData.length} bản ghi ra file ${filename}`,
      });

    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: "Lỗi xuất Excel",
        description: "Đã xảy ra lỗi khi xuất file Excel. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
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
      <div className="max-w-full">
        {/* Title */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Cảnh báo tín chấp</h1>
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
                  onChange={handleCustomerFilterChange}
                  className="pl-10 w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Lý do</label>
              <Select value={reasonFilter} onValueChange={handleReasonFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lý do" />
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
          </div>
          
          <div className="flex items-end gap-2 px-4">
            <Button 
              variant="outline" 
              onClick={handleClearFilter}
              disabled={!customerNameFilter && reasonFilter === "all"}
            >
              Xóa bộ lọc
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleExportExcel}
              disabled={isExporting || allCredits.length === 0}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Xuất Excel
            </Button>
          </div>
          
          {/* Show filter info if active */}
          {(customerNameFilter || reasonFilter !== "all") && (
            <div className="mt-2 text-sm text-blue-600">
              {customerNameFilter && (
                <span>Đang lọc theo tên khách hàng: <span className="font-semibold">{customerNameFilter}</span> </span>
              )}
              {reasonFilter !== "all" && (
                <span>Đang lọc theo lý do: <span className="font-semibold">{reasonFilter}</span> </span>
              )}
              {totalItems > 0 ? 
                ` (${totalItems} kết quả)` : 
                " (Không có kết quả)"}
            </div>
          )}
        </div>
        
        <CreditWarningsTable
            credits={filteredCredits}
            isLoading={isLoading || calculationsLoading}
            onShowPaymentHistory={handleShowPaymentHistory}
            creditCalculations={creditCalculations}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
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