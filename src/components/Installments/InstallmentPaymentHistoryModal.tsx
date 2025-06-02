"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  InstallmentWithCustomer,
  InstallmentStatus,
} from "@/models/installment";
import { InstallmentPaymentPeriod } from "@/models/installmentPayment";
import { bulkSaveInstallmentPayments, getInstallmentPaymentPeriods, resetInstallmentDebtAmount, updateInstallmentDebtAmount } from "@/lib/installmentPayment";
import { getInstallmentById } from "@/lib/installment";
import { formatCurrency, formatDate, formatNumberWithCommas, parseFormattedNumber } from "@/lib/utils";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import {
  InstallmentAmountHistory,
  getInstallmentAmountHistory,
  recordDebtPayment,
} from "@/lib/installmentAmountHistory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PaymentTab } from "./tabs/PaymentTab";
import { calculateDaysBetween,  } from "@/lib/utils";
import { 
  calculateTotalPaidFromHistory as calcTotalPaidFromHistory,
  calculateRemainingToPay,
  calculateRemainingPeriods as calcRemainingPeriods,
  calculateRatio
} from "@/lib/installmentCalculations";
// Define the tabs for this modal
export type TabId =
  | "payment"
  | "principal-repayment"
  | "close"
  | "documents"
  | "history"
  | "bad-debt"
  | "rotate";

export const DEFAULT_INSTALLMENT_TABS = [
  { id: "payment" as TabId, label: "Đóng lãi phí" },
  { id: "close" as TabId, label: "Đóng HĐ" },
  { id: "rotate" as TabId, label: "Đảo HĐ" },
  { id: "documents" as TabId, label: "Chứng từ" },
  { id: "history" as TabId, label: "Lịch sử" },
  { id: "bad-debt" as TabId, label: "Báo xấu khách hàng" },
];

interface CreditActionTabsProps {
  tabs: { id: TabId; label: string; disabled?: boolean }[];
  activeTab: string;
  onChangeTab: (tabId: TabId) => void;
  variant?: "default" | "scrollable";
  className?: string;
}

// Tab component
export function CreditActionTabs({
  tabs,
  activeTab,
  onChangeTab,
  variant = "default",
  className = "",
}: CreditActionTabsProps) {
  const isScrollable = variant === "scrollable";

  return (
    <div
      className={`border-b ${isScrollable ? "overflow-x-auto" : ""} ${className}`}
    >
      <div
        className={`flex ${isScrollable ? "flex-wrap" : ""}`}
        style={{ minWidth: isScrollable ? "650px" : "auto" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && onChangeTab(tab.id as TabId)}
            disabled={tab.disabled}
            className={`px-4 py-2 transition-all ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-600 font-medium"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            } ${tab.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface InstallmentPaymentHistoryModalProps {
  isOpen: boolean;
  onClose: (hasDataChanged?: boolean) => void;
  installment: InstallmentWithCustomer;
  onContractStatusChange?: () => void;
  onPaymentUpdate?: () => void;
}

export function InstallmentPaymentHistoryModal({
  isOpen,
  onClose,
  installment: initialInstallment,
  onContractStatusChange,
  onPaymentUpdate,
}: InstallmentPaymentHistoryModalProps) {
  // State variables
  const [installment, setInstallment] =
    useState<InstallmentWithCustomer>(initialInstallment);
  const installmentId = installment?.id || "";
  const [paymentPeriods, setPaymentPeriods] = useState<
    InstallmentPaymentPeriod[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("payment"); // Tab mặc định là "Đóng lãi phí"

  // State cho chỉnh sửa thanh toán
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  // State for date editing
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [selectedDatePeriodId, setSelectedDatePeriodId] = useState<
    string | null
  >(null);
  const [selectedDate, setSelectedDate] = useState<string>("");

  // State for contract rotation
  const [rotationLoanDate, setRotationLoanDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [rotationLoanAmount, setRotationLoanAmount] =
    useState<string>("1,000,000");
  const [rotationDownPayment, setRotationDownPayment] =
    useState<string>("800.000");
  const [rotationDuration, setRotationDuration] = useState<string>("10");
  const [rotationPaymentPeriod, setRotationPaymentPeriod] =
    useState<string>("6");

  // State cho lịch sử giao dịch
  const [amountHistory, setAmountHistory] = useState<
    InstallmentAmountHistory[]
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // State for checkbox processing
  const [processingCheckbox, setProcessingCheckbox] = useState<boolean>(false);
  const [processingPeriodId, setProcessingPeriodId] = useState<string | null>(
    null,
  );

  // State for rotation processing
  const [isRotating, setIsRotating] = useState<boolean>(false);

  // Confirmation dialog state
  const [isCloseContractConfirmOpen, setIsCloseContractConfirmOpen] = useState(false);

  // State for temporary edited values
  const [tempEditedDate, setTempEditedDate] = useState<string | null>(null);
  const [tempEditedAmount, setTempEditedAmount] = useState<number | null>(null);

  // State để track việc có thay đổi dữ liệu hay không
  const [hasDataChanged, setHasDataChanged] = useState(false);

  // Pre-load các modules cần thiết để tránh lag khi sử dụng dynamic imports
  useEffect(() => {
    if (isOpen) {
      // Pre-load các modules sẽ được sử dụng
      import("@/lib/installmentPayment");
      import("@/lib/installmentAmountHistory");
    }
  }, [isOpen]);

  // Tạo một ID cho mỗi lần mở modal để kiểm soát race conditions
  const modalSessionId = useRef(Date.now().toString());
  useEffect(() => {
    if (isOpen) {
      modalSessionId.current = Date.now().toString();
    }
  }, [isOpen]);

  // Hàm tải dữ liệu kỳ thanh toán với kiểm soát race condition
  const loadPaymentPeriods = useCallback(
    async (currentInstallmentId: string, sessionId: string) => {
      if (!currentInstallmentId) return;

      console.log('loadPaymentPeriods called with:', currentInstallmentId, sessionId);
      setLoading(true);
      setError(null);

      try {
        const { data, error } =
          await getInstallmentPaymentPeriods(currentInstallmentId);

        console.log('getInstallmentPaymentPeriods result:', { data, error });

        // Kiểm tra nếu modal session vẫn là session hiện tại
        if (sessionId !== modalSessionId.current) {
          console.log("Skipping stale payment periods update");
          return;
        }

        if (error) {
          throw error;
        }

        // Set payment periods directly from data
        setPaymentPeriods(data || []);
        console.log('Payment periods set:', data?.length || 0, 'periods');
      } catch (err) {
        console.error("Error loading payment periods:", err);
        setError("Không thể tải dữ liệu thanh toán");
      } finally {
        if (sessionId === modalSessionId.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  // Cập nhật state installment khi initialInstallment thay đổi
  useEffect(() => {
    setInstallment(initialInstallment);
  }, [initialInstallment]);

  // Load dữ liệu kỳ thanh toán khi modal mở
  useEffect(() => {
    if (isOpen && installment?.id) {
      console.log('Loading payment periods for installment:', installment.id);
      const currentSessionId = modalSessionId.current;
      loadPaymentPeriods(installment.id, currentSessionId);
    }
  }, [isOpen, installment?.id, loadPaymentPeriods]);

  // Hàm reload thông tin hợp đồng
  const reloadInstallmentInfo = async () => {
    if (!installment?.id) return;

    const currentSessionId = modalSessionId.current;

    try {
      const { data, error } = await getInstallmentById(installment.id);

      // Kiểm tra nếu session vẫn là session hiện tại
      if (currentSessionId !== modalSessionId.current) return;

      if (error) {
        throw error;
      }

      if (data) {
        setInstallment(data);
        // Tải lại dữ liệu kỳ thanh toán khi thông tin hợp đồng thay đổi
        loadPaymentPeriods(data.id, currentSessionId);
      }
    } catch (err) {
      console.error("Error reloading installment info:", err);
    }
  };

  // Load transaction history when the modal opens
  useEffect(() => {
    if (isOpen && installment?.id) {
      loadTransactionHistory();
    }
  }, [isOpen, installment?.id]);

  // Function to load transaction history (moved outside useEffect to be reusable)
  const loadTransactionHistory = async () => {
    if (!installment?.id) return;

    setLoadingHistory(true);

    try {
      const { data, error } = await getInstallmentAmountHistory(
        installment.id,
      );

      if (error) {
        throw error;
      }

      setAmountHistory(data || []);
    } catch (err) {
      console.error("Error loading transaction history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  

  

  // Tính toán danh sách kỳ dự kiến kết hợp với kỳ đã có trong database
  // Memoize kết quả để tránh tính toán lại nhiều lần, cải thiện hiệu năng
  const calculateCombinedPaymentPeriods =
    useMemo((): InstallmentPaymentPeriod[] => {
      console.log('calculateCombinedPaymentPeriods called with:', {
        installment: installment?.id,
        paymentPeriods: paymentPeriods.length,
        hasInstallmentData: !!installment
      });

      // Nếu không có dữ liệu hợp đồng, trả về mảng rỗng
      if (
        !installment ||
        !installment.duration ||
        !installment.payment_period ||
        !installment.start_date
      ) {
        console.log('Missing installment data, returning paymentPeriods:', paymentPeriods.length);
        return paymentPeriods;
      }

      // Lấy các thông số cơ bản của hợp đồng
      const loanPeriod = installment.duration;
      const paymentPeriod = installment.payment_period;
      const installmentAmount = installment.installment_amount || 0;
      
      // Tính ngày kết thúc hợp đồng 
      const startDate = new Date(installment.start_date);
        const contractEndDate = new Date(startDate);
        contractEndDate.setDate(startDate.getDate() + loanPeriod - 1);
        
      // Helper function: Parse date string dd/MM/yyyy to Date
      const parseDate = (dateStr: string): Date => {
        const dateParts = dateStr.split('/');
        return new Date(
          parseInt(dateParts[2]), // năm
          parseInt(dateParts[1]) - 1, // tháng (0-indexed)
          parseInt(dateParts[0]) // ngày
        );
      };

      // Helper function: Create a single period
      const createPeriod = (
        periodNumber: number,
        currentDate: Date,
        periodDays: number,
        expectedAmount: number,
        contractEndDate: Date
      ): InstallmentPaymentPeriod => {
          // Tính ngày kết thúc kỳ
          const periodEndDate = new Date(currentDate);
          periodEndDate.setDate(currentDate.getDate() + periodDays - 1);
          
          // Nếu vượt quá ngày kết thúc hợp đồng, điều chỉnh lại
          if (periodEndDate > contractEndDate) {
            periodEndDate.setTime(contractEndDate.getTime());
          }
          
        return {
            id: `calculated-${periodNumber}`,
          installmentId: installment.id,
            periodNumber,
            dueDate: format(currentDate, 'dd/MM/yyyy'),
            endDate: format(periodEndDate, 'dd/MM/yyyy'),
          paymentStartDate: undefined,
            expectedAmount,
            actualAmount: 0,
            isOverdue: currentDate < new Date(),
          daysOverdue: currentDate < new Date() 
                ? calculateDaysBetween(currentDate, new Date())
                : 0,
        };
      };
          
      // Helper function: Create periods from a start date
      const createPeriodsFromDate = (
        startFromDate: Date,
        startPeriodNumber: number,
        remainingAmount: number,
        remainingDays?: number
      ): InstallmentPaymentPeriod[] => {
        const totalPeriods = Math.ceil(loanPeriod / paymentPeriod);
        const periodsToCreate = totalPeriods - startPeriodNumber + 1;
        
        if (periodsToCreate <= 0) return [];

        // Tính số tiền mỗi ngày hoặc mỗi kỳ
        const amountPerDay = remainingDays ? (() => {
          if (!installment?.amount_given || !installment?.installment_amount || !installment?.duration) {
            return 0;
          }
          // Tính lãi suất từ down_payment và installment_amount
          const interestRate = ((installment.installment_amount - installment.amount_given) / installment.amount_given) * 100;
          // Tính số tiền lãi mỗi ngày
          const dailyInterest = (installment.amount_given * interestRate / 100) / installment.duration;
          // Số tiền gốc mỗi ngày
          const dailyPrincipal = installment.amount_given / installment.duration;
          // Tổng số tiền phải trả mỗi ngày (gốc + lãi)
          return dailyPrincipal + dailyInterest;
        })() : 0;
        const amountPerPeriod = remainingDays ? 0 : (installment.installment_amount || 0) / loanPeriod * paymentPeriod;
        const periods: InstallmentPaymentPeriod[] = [];
        let currentDate = new Date(startFromDate);
          
        for (let i = 0; i < periodsToCreate; i++) {
          const periodNumber = startPeriodNumber + i;
            
            // Tính số ngày của kỳ này
            let periodDays = paymentPeriod;
          if (i === periodsToCreate - 1) {
            const daysToContractEnd = calculateDaysBetween(currentDate, contractEndDate);
            if (daysToContractEnd < paymentPeriod) {
              periodDays = Math.max(1, daysToContractEnd);
            }
          }
            
          // Tính số tiền dự kiến
          let expectedAmount = remainingDays ? Math.round(amountPerDay * periodDays) : (amountPerPeriod / paymentPeriod) * periodDays;
            
          const period = createPeriod(periodNumber, currentDate, periodDays, expectedAmount, contractEndDate);
          periods.push(period);
            
            // Cập nhật ngày bắt đầu cho kỳ tiếp theo
          currentDate = new Date(parseDate(period.endDate || period.dueDate));
          currentDate.setDate(currentDate.getDate() + 1);
          }
          
          return periods;
      };

      // Nếu không có kỳ nào từ database, tạo toàn bộ từ đầu
      if (paymentPeriods.length === 0) {
        return createPeriodsFromDate(startDate, 1, installmentAmount);
        }
        
      // Có kỳ từ database - sắp xếp và xử lý
      const sortedDBPeriods = [...paymentPeriods].sort((a, b) => a.periodNumber - b.periodNumber);
        const lastPeriod = sortedDBPeriods[sortedDBPeriods.length - 1];
        
        // Xác định ngày kết thúc của kỳ cuối cùng
        let lastPeriodEndDate: Date;
        
        if (lastPeriod.endDate) {
        lastPeriodEndDate = parseDate(lastPeriod.endDate);
        } else if (lastPeriod.dueDate) {
        const lastPeriodStartDate = parseDate(lastPeriod.dueDate);
          lastPeriodEndDate = new Date(lastPeriodStartDate);
          lastPeriodEndDate.setDate(lastPeriodStartDate.getDate() + paymentPeriod - 1);
        } else {
          lastPeriodEndDate = new Date(startDate);
        lastPeriodEndDate.setDate(startDate.getDate() + lastPeriod.periodNumber * paymentPeriod - 1);
        }
        
        // Tính ngày bắt đầu cho kỳ tiếp theo
        const nextStartDate = new Date(lastPeriodEndDate);
        nextStartDate.setDate(lastPeriodEndDate.getDate() + 1);
        
      // Nếu đã vượt quá ngày kết thúc hợp đồng, không cần tạo thêm kỳ
        if (nextStartDate > contractEndDate) {
          return sortedDBPeriods;
        }
        
      // Tính số tiền còn lại và số ngày còn lại
      const remainingAmount = Math.max(0, installmentAmount);
      const remainingDays = calculateDaysBetween(nextStartDate, contractEndDate);
        
      if (remainingDays <= 0) {
        return sortedDBPeriods;
      }
        
        // Tạo các kỳ còn thiếu
      const newPeriods = createPeriodsFromDate(
        nextStartDate, 
        lastPeriod.periodNumber + 1, 
        remainingAmount,
        remainingDays
      );
      
      return [...sortedDBPeriods, ...newPeriods];
    }, [
      installment,
      paymentPeriods,
    ]);


  // Calculate total paid amount from transaction history
  const calculateTotalPaidFromHistory = (): number => {
    return calcTotalPaidFromHistory(amountHistory);
  };

  // Calculate remaining amount
  const databasePeriods = paymentPeriods.filter(
    (p) => !p.id.startsWith("calculated-"),
  );
  const totalFees =
    databasePeriods.length > 0
      ? databasePeriods.reduce((sum, period) => sum + period.expectedAmount, 0)
      : 0;
  const totalCustomerPayments = databasePeriods.reduce(
    (sum, period) => sum + (period.actualAmount || 0),
    0,
  );
  const remainingAmount = totalCustomerPayments - totalFees;

  // Calculate remaining periods
  const calculateRemainingPeriods = () => {
    return calcRemainingPeriods(installment, paymentPeriods);
  };

  // Helper function to format number with dots
  const formatNumberWithDot = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const isPeriodInDatabase = (
    period: InstallmentPaymentPeriod | undefined,
  ): boolean => {
    if (!period || !period.id) return false;
    return !period.id.startsWith("calculated-") && Boolean(period.actualAmount);
  };
  
  // Find the oldest unpaid period
  const findOldestUnpaidPeriodIndex = useMemo(() => {
    return calculateCombinedPaymentPeriods.findIndex(p => !isPeriodInDatabase(p));
  }, [calculateCombinedPaymentPeriods, isPeriodInDatabase]);

  // Xử lý checkbox đánh dấu đã thanh toán - với phương pháp optimistic update
  const handleCheckboxChange = async (
    period: InstallmentPaymentPeriod,
    checked: boolean,
    index: number,
  ) => {
    if (!installment?.id || processingCheckbox) return; // Prevent concurrent operations
    
    const startTime = performance.now();
    console.log(`Starting checkbox processing for period ${period.periodNumber}, checked: ${checked}`);
    
    // Set processing state
    setProcessingCheckbox(true);
    setProcessingPeriodId(period.id);
    
    // Set timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setProcessingCheckbox(false);
      setProcessingPeriodId(null);
      toast({
        variant: "destructive",
        title: "Timeout",
        description: "Thao tác mất quá nhiều thời gian. Vui lòng thử lại.",
      });
    }, 30000); // 30 second timeout
    
    try {
      // Import the new API function
      const { markInstallmentPaymentPeriods } = await import('@/lib/installment-payment-api');
      
      if (checked) {
        // Find all unchecked periods from the oldest up to this one
        const periodsToCheck = [];
        
        // Go through all periods up to the current one (inclusive)
        for (let i = 0; i <= index; i++) {
          const p = calculateCombinedPaymentPeriods[i];
          // Only include periods that don't have any payment in DB yet
          if (!isPeriodInDatabase(p)) {
            periodsToCheck.push(p);
          }
        }
        
        // If no periods to check, exit early
        if (periodsToCheck.length === 0) {
          toast({
            title: "Thông báo",
            description: "Kỳ này đã được thanh toán rồi.",
          });
          return;
        }
        
        // Use the new API to mark periods
        const result = await markInstallmentPaymentPeriods(installment.id, periodsToCheck, 'mark');
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to mark installment payment periods');
        }
        
        // Check if any periods had issues
        const hasErrors = result.processed_periods?.some(p => p.status === 'error');
        const alreadyPaidCount = result.processed_periods?.filter(p => p.status === 'already_paid').length || 0;
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
        }
        
        // Show success message with details
        let successMessage = "Đã đánh dấu thanh toán thành công";
        const totalProcessed = (autoCreatedCount + updatedCount + createdCount);
        
        if (totalProcessed > 1) {
          successMessage += ` cho ${totalProcessed} kỳ`;
        }
        
        if (autoCreatedCount > 0) {
          successMessage += ` (tự động tạo ${autoCreatedCount} kỳ)`;
        }
        
        if (alreadyPaidCount > 0) {
          successMessage += ` (${alreadyPaidCount} kỳ đã thanh toán trước đó)`;
        }
        
        toast({
          title: "Thành công",
          description: successMessage,
        });
        
      } else {
        // Uncheck logic - use the new API
        const result = await markInstallmentPaymentPeriods(installment.id, [period], 'unmark');
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to unmark installment payment period');
        }
        
        // Check the result
        const processedPeriod = result.processed_periods?.[0];
        if (processedPeriod?.status === 'cannot_unmark_has_later_payments') {
          toast({
            variant: "destructive",
            title: "Không thể bỏ đánh dấu",
            description: "Không thể bỏ đánh dấu kỳ này vì có các kỳ sau đã được thanh toán.",
          });
          return;
        }
        
        if (processedPeriod?.status === 'cannot_unmark_calculated') {
          toast({
            variant: "destructive",
            title: "Không thể bỏ đánh dấu",
            description: "Không thể bỏ đánh dấu kỳ tính toán. Chỉ có thể bỏ đánh dấu các kỳ đã lưu trong database.",
          });
          return;
        }
        
        if (processedPeriod?.status === 'not_found') {
          toast({
            variant: "destructive",
            title: "Không tìm thấy",
            description: "Không tìm thấy kỳ thanh toán này trong database.",
          });
          return;
        }
        
        if (processedPeriod?.status === 'deleted') {
          toast({
            title: "Thành công",
            description: "Đã bỏ đánh dấu thanh toán cho kỳ này",
          });
        }
      }
      
      // Refresh data after successful operation
      if (installment?.id) {
        // Reload payment periods data
        const { data: paymentData } = await getInstallmentPaymentPeriods(installment.id);
        if (paymentData) {
          setPaymentPeriods(paymentData);
        }
        
        // Refresh amount history
        const { data: historyData } = await getInstallmentAmountHistory(installment.id);
        if (historyData) {
          setAmountHistory(historyData);
        }
        
        // Refresh installment info
        const { data: installmentData } = await getInstallmentById(installment.id);
        if (installmentData) {
          setInstallment(installmentData);
        }
        
        // Call callback to update summary immediately
        if (onPaymentUpdate) {
          onPaymentUpdate();
        }
        
        // Mark that data has changed
        setHasDataChanged(true);
      }
      
      const endTime = performance.now();
      console.log(`Checkbox processing completed in ${endTime - startTime}ms`);
      
    } catch (error) {
      console.error("Error in handleCheckboxChange:", error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Có lỗi xảy ra khi xử lý. Vui lòng thử lại.",
      });
    } finally {
      // Always reset processing state when completed
      setProcessingCheckbox(false);
      setProcessingPeriodId(null);
      clearTimeout(timeoutId);
    }
  };

  // Bắt đầu chỉnh sửa khoản thanh toán
  const handleStartEditing = (period: InstallmentPaymentPeriod, periodIndex: number) => {
    // Không sửa khoản đã thanh toán và chỉ sửa kỳ chưa đóng cũ nhất
    if (isPeriodInDatabase(period) || periodIndex !== findOldestUnpaidPeriodIndex) return;

    setSelectedPeriodId(period.id);
    // Đặt giá trị mặc định là số tiền lãi phí dự kiến
    const amount = period.expectedAmount || 0;
    setPaymentAmount(amount);
    setTempEditedAmount(amount); // Store in temp variable
  };

  // Lưu khoản thanh toán
  const handleSavePayment = async (period: InstallmentPaymentPeriod) => {
    // Store the payment amount in temporary variable
    setTempEditedAmount(paymentAmount);
    
    // Update UI appearance but don't save to DB yet
    setSelectedPeriodId(null);
  };

  // Handle date selection
  const handleStartDateEditing = (period: InstallmentPaymentPeriod, periodIndex: number) => {
    // Không sửa khoản đã thanh toán và chỉ sửa kỳ chưa đóng cũ nhất
    if (isPeriodInDatabase(period) || periodIndex !== findOldestUnpaidPeriodIndex) return;

    setSelectedDatePeriodId(period.id);
    setIsEditingDate(true);

    // Set default date to today if not already set
    const dateValue = period.paymentStartDate
      ? period.paymentStartDate.split("/").reverse().join("-")
      : format(new Date(), "yyyy-MM-dd");

    setSelectedDate(dateValue);
    setTempEditedDate(dateValue); // Store in temp variable
  };

  // Modify handleSaveDate to store value in temp instead of saving to DB
  const handleSaveDate = async (period: InstallmentPaymentPeriod, dateValue: string) => {
    if (!dateValue) return;
    
    // Store the selected date in temporary variable
    setTempEditedDate(dateValue);
    
    // Update UI appearance but don't save to DB yet
    setSelectedDatePeriodId(null);
    setIsEditingDate(false);
  };


  

  // Calculate customer receive amount
  const calculateCustomerReceiveAmount = (): number => {
    const downPayment = parseFormattedNumber(rotationDownPayment);
    console.log("downPayment", rotationDownPayment);
    const amountToPay = Math.max(0, calculateRemainingPeriods() * (installment?.installment_amount || 0) / Math.ceil((installment?.duration || 0) / (installment?.payment_period || 1)));
    const remainingDebt = 0 - (installment.debt_amount || 0);

    // Customer receives: downPayment - remainingDebt
    return downPayment - amountToPay - remainingDebt;
  };

  // Handle rotation loan amount change
  const handleRotationLoanAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value.replace(/,/g, "");
    const numberValue = parseInt(value, 10);

    if (!isNaN(numberValue)) {
      setRotationLoanAmount(formatNumberWithCommas(numberValue));
    } else if (value === "") {
      setRotationLoanAmount("");
    }
  };

  // Handle rotation down payment change
  const handleRotationDownPaymentChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value.replace(/\./g, "");
    const numberValue = parseInt(value, 10);

    if (!isNaN(numberValue)) {
      setRotationDownPayment(formatNumberWithDot(numberValue));
    } else if (value === "") {
      setRotationDownPayment("");
    }
  };

  // Handler for rotating the contract (creating a new one and closing the current)
  const handleRotateContract = async () => {
    if (!installment?.id || !installment?.customer_id) return;

    setIsRotating(true); // Set loading state

    try {
      // Import necessary functions
      const { saveInstallmentPayment, updateInstallmentStatus, bulkSaveInstallmentPayments } = await import(
        "@/lib/installmentPayment"
      );
      const { createInstallment } = await import("@/lib/installment");
      const { recordContractRotation, recordBulkPayment, recordDebtPayment, recordContractClosure } = await import(
        "@/lib/installmentAmountHistory"
      );

      // Get all periods including calculated ones
      const allPeriods = calculateCombinedPaymentPeriods;

      // Find periods that need to be marked as paid
      const periodsToUpdate = allPeriods.filter((p: InstallmentPaymentPeriod) => !isPeriodInDatabase(p));
      if (periodsToUpdate.length > 0) {
        await bulkSaveInstallmentPayments(
          installment.id,
          periodsToUpdate,
          installment.employee_id
        );
        // Ghi nhận lịch sử thanh toán
        await recordBulkPayment(
          installment.id,
          installment.employee_id,
          calculateRemainingPeriods() * (installment?.installment_amount || 0) / Math.ceil((installment?.duration || 0) / (installment?.payment_period || 1)),
          periodsToUpdate.length
        );
      }

      // Ghi lại lịch sử thanh toán nợ (nếu có)
      if (installment?.debt_amount) {
        await recordDebtPayment(installment.id, installment.employee_id, installment.debt_amount);
      }

      // Reset debt amount to 0
      await resetInstallmentDebtAmount(installment.id);

      // Update installment status to closed
      await updateInstallmentStatus(installment.id, InstallmentStatus.CLOSED);

      // Record in transaction history
      await recordContractClosure(installment.id, installment.employee_id);

      // Create a new contract
      const newContract = {
        customer_id: installment.customer_id,
        employee_id: installment.employee_id,
        contract_code: `${installment.contract_code}-R`, // Add "R" suffix for rotated
        down_payment: parseFormattedNumber(rotationDownPayment),
        installment_amount: parseFormattedNumber(rotationLoanAmount),
        loan_period: parseInt(rotationDuration, 10),
        payment_period: parseInt(rotationPaymentPeriod, 10),
        loan_date: rotationLoanDate,
        notes: `Đảo từ hợp đồng ${installment.contract_code}. Khách thực nhận: ${formatCurrency(calculateCustomerReceiveAmount())}`,
        status: InstallmentStatus.ON_TIME,
      };

      const { data, error } = await createInstallment(newContract);

      if (error) {
        throw error;
      }

      // Record rotation in transaction history
      if (data) {
        await recordContractRotation(
          installment.id,
          data.id,
          installment.employee_id,
          Math.max(0, calculateRemainingToPay(installment, calculateTotalPaidFromHistory())),
        );
      }

      // Show success message
      toast({
        title: "Thành công",
        description: "Đã đảo hợp đồng thành công!",
      });

      // Trigger reload if callback provided
      if (onContractStatusChange) {
        onContractStatusChange();
      }

      // Trigger update of financial summary
      if (onPaymentUpdate) {
        onPaymentUpdate();
      }
      
      // Mark that data has changed
      setHasDataChanged(true);
    } catch (error) {
      console.error("Error rotating contract:", error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi đảo hợp đồng. Vui lòng thử lại.",
      });
    } finally {
      setIsRotating(false); // Reset loading state
    }
  };

  // Format date helper for transaction history
  const formatHistoryDate = (dateString: string): string => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "dd-MM-yyyy HH:mm:ss", {
        locale: vi,
      });
    } catch (error) {
      return "-";
    }
  };

  // Handler for closing the installment - show confirmation first
  const showCloseInstallmentConfirmation = () => {
    setIsCloseContractConfirmOpen(true);
  };

  // Handler for closing the installment
  const handleCloseInstallment = async () => {
    if (!installment?.id) return;
    
    // Close the confirmation dialog
    setIsCloseContractConfirmOpen(false);

    try {
      // Import necessary functions
      const { saveInstallmentPayment, updateInstallmentStatus } = await import(
        "@/lib/installmentPayment"
      );

      const { recordContractClosure } = await import(
        "@/lib/installmentAmountHistory"
      );

      // Get all periods including calculated ones
      const allPeriods = calculateCombinedPaymentPeriods;

      // Find periods that need to be marked as paid
      const periodsToUpdate = allPeriods.filter((p: InstallmentPaymentPeriod) => !isPeriodInDatabase(p));
      if (periodsToUpdate.length > 0) {
        await bulkSaveInstallmentPayments(
          installment.id,
          periodsToUpdate,
          installment.employee_id
        );
        // Ghi nhận lịch sử thanh toán
        const { recordBulkPayment } = await import('@/lib/installmentAmountHistory');
        await recordBulkPayment(
          installment.id,
          installment.employee_id,
          calculateRemainingPeriods() * (installment?.installment_amount || 0) / Math.ceil((installment?.duration || 0) / (installment?.payment_period || 1)),
          periodsToUpdate.length
        );
      }
      

      // Ghi lại lịch sử thanh toán nợ ( nếu có )
      if (installment?.debt_amount) {
        await recordDebtPayment(installment.id, installment.employee_id, installment.debt_amount);
      }

      // Reset debt amount to 0
      await resetInstallmentDebtAmount(installment.id);

      // Update installment status to closed
      await updateInstallmentStatus(installment.id, InstallmentStatus.CLOSED);

      // Record in transaction history
      await recordContractClosure(installment.id, installment.employee_id);

      // Refresh data
      const { data, error } = await getInstallmentPaymentPeriods(
        installment.id,
      );
      if (!error && data) {
        setPaymentPeriods(data);
      }

      // Reload installment info to get updated status
      await reloadInstallmentInfo();

      // Trigger page table reload if callback provided
      if (onContractStatusChange) {
        onContractStatusChange();
      }

      // Gọi callback để cập nhật summary
      if (onPaymentUpdate) {
        onPaymentUpdate();
      }
      
      // Mark that data has changed
      setHasDataChanged(true);

      toast({
        title: "Thành công",
        description: "Hợp đồng đã được đóng thành công!",
      });
    } catch (error) {
      console.error("Error closing installment:", error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi đóng hợp đồng. Vui lòng thử lại.",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose(hasDataChanged)}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hợp đồng trả góp</DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {/* Thông tin khách hàng */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">
              {installment?.customer?.name || "Khách hàng"}
            </h3>
          </div>

          {/* Tổng hợp chi tiết */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">
                      Tiền đưa khách
                    </td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>
                      {formatCurrency(installment?.amount_given || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Trả góp</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>
                      {formatCurrency(installment?.installment_amount || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tỷ lệ</td>
                    <td className="py-1 px-2 text-right border" colSpan={2}>
                      {calculateRatio(installment)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">
                      Thời gian vay
                    </td>
                    <td className="py-1 px-2 text-right border">
                      {formatDate(installment?.start_date)}
                    </td>
                    <td className="py-1 px-2 text-right border">
                      {installment?.start_date && installment?.duration
                        ? formatDate(
                            new Date(
                              new Date(installment.start_date).getTime() +
                                (installment.duration - 1) *
                                  24 *
                                  60 *
                                  60 *
                                  1000,
                            ).toISOString(),
                          )
                        : "-"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Số kỳ còn lại</td>
                    <td className="py-1 px-2 text-right border text-red-600" colSpan={2}>
                      {calculateRemainingPeriods()} kỳ
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">{installment?.debt_amount && installment?.debt_amount > 0 ? "Tiền thừa" : "Nợ cũ"}</td>
                    <td className="py-1 px-2 text-right border text-red-600" colSpan={2}>
                      {formatCurrency(
                        Math.abs(installment?.debt_amount || 0),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">
                      Số tiền giao khách
                    </td>
                    <td className="py-1 px-2 text-right border">
                      {formatCurrency(installment?.amount_given || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">
                      Tổng tiền phải đóng
                    </td>
                    <td className="py-1 px-2 text-right border text-red-600">
                      {formatCurrency(installment?.installment_amount || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Đã đóng được</td>
                    <td className="py-1 px-2 text-right border">
                      {formatCurrency(calculateTotalPaidFromHistory())}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">
                      Còn lại phải đóng
                    </td>
                    <td className="py-1 px-2 text-right border text-red-600">
                      {formatCurrency(
                        calculateRemainingToPay(installment, calculateTotalPaidFromHistory())
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tổng lãi phí</td>
                    <td className="py-1 px-2 text-right border">
                      {formatCurrency(
                        (installment?.installment_amount || 0) - (installment?.amount_given || 0),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabs */}
          <CreditActionTabs
            tabs={DEFAULT_INSTALLMENT_TABS}
            activeTab={activeTab}
            onChangeTab={(tabId: TabId) => setActiveTab(tabId)}
            variant="scrollable"
            className="mb-2"
          />
          
          {/* Content based on active tab */}
          {activeTab === "payment" && (
            <PaymentTab
              loading={loading}
              error={error}
              calculateCombinedPaymentPeriods={calculateCombinedPaymentPeriods}
              isPeriodInDatabase={isPeriodInDatabase}
              selectedPeriodId={selectedPeriodId}
              selectedDatePeriodId={selectedDatePeriodId}
              selectedDate={selectedDate}
              tempEditedDate={tempEditedDate}
              tempEditedAmount={tempEditedAmount}
              paymentAmount={paymentAmount}
              installment={installment}
              findOldestUnpaidPeriodIndex={findOldestUnpaidPeriodIndex}
              handleStartEditing={handleStartEditing}
              handleSavePayment={handleSavePayment}
              setPaymentAmount={setPaymentAmount}
              setSelectedPeriodId={setSelectedPeriodId}
              handleStartDateEditing={handleStartDateEditing}
              handleSaveDate={handleSaveDate}
              setSelectedDate={setSelectedDate}
              processingCheckbox={processingCheckbox}
              processingPeriodId={processingPeriodId}
              handleCheckboxChange={handleCheckboxChange}
            />
          )}

          {activeTab === "close" && (
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-medium mb-4">Đóng hợp đồng</h3>

              <div className="mb-4 border rounded-md overflow-hidden">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 font-medium border">
                        Tổng tiền trả góp
                      </td>
                      <td className="px-4 py-2 text-right font-medium border">
                        {formatCurrency(installment?.installment_amount || 0)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border">Tiền đưa khách</td>
                      <td className="px-4 py-2 text-right border">
                        {formatCurrency(installment?.amount_given || 0)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border">Đã đóng được</td>
                      <td className="px-4 py-2 text-right border text-green-600">
                        {formatCurrency(calculateTotalPaidFromHistory())}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border">Còn phải đóng</td>
                      <td className="px-4 py-2 text-right border text-red-600">
                        {formatCurrency(
                          Math.max(0, calculateRemainingPeriods() * (installment?.installment_amount || 0) / Math.ceil((installment?.duration || 0) / (installment?.payment_period || 1))),
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border font-bold">Nợ cũ</td>
                      <td className="px-4 py-2 text-right border text-red-600" colSpan={2}>
                        {formatCurrency(
                          (installment?.debt_amount || 0),
                        )}
                      </td>
                    </tr>

                    <tr className="bg-red-50">
                      <td className="px-4 py-3 font-medium border text-red-700">
                        Còn lại phải đóng để đóng hợp đồng
                      </td>
                      <td className="px-4 py-3 text-right border font-bold text-red-700 text-lg">
                        {formatCurrency(
                          Math.max(
                            0,
                            calculateRemainingToPay(installment, calculateTotalPaidFromHistory())
                          ),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-center">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                  onClick={showCloseInstallmentConfirmation}
                  disabled={installment?.status === InstallmentStatus.CLOSED || installment?.status === InstallmentStatus.DELETED}
                >
                  Đóng HĐ
                </Button>
              </div>
              
              {/* Confirmation Dialog for Closing Contract */}
              <AlertDialog 
                open={isCloseContractConfirmOpen} 
                onOpenChange={setIsCloseContractConfirmOpen}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Xác nhận đóng hợp đồng</AlertDialogTitle>
                    <AlertDialogDescription>
                      Bạn có chắc chắn muốn đóng hợp đồng này không? 
                      Hành động này sẽ đánh dấu tất cả các kỳ còn lại là đã thanh toán và chuyển trạng thái hợp đồng thành "Đóng".
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Hủy</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleCloseInstallment}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Xác nhận đóng hợp đồng
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {activeTab === "documents" && (
            <div className="p-4 border rounded-md">
              <SectionHeader
                icon={<Icon name="document" />}
                title="Chứng từ"
                color="blue"
              />

              <div className="flex flex-wrap gap-4 mb-6">
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  disabled={installment?.status === InstallmentStatus.DELETED}
                >
                  <Icon name="upload" size={16} />
                  Upload Ảnh
                </Button>

                <Button 
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                  disabled={installment?.status === InstallmentStatus.DELETED}
                >
                  <Icon name="document" size={16} />
                  In Chứng Từ
                </Button>
              </div>

              {/* Document upload area */}
              <div className="mb-6">
                <div className={`border-2 border-dashed border-gray-300 rounded-md p-6 text-center ${installment?.status === InstallmentStatus.DELETED ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Icon
                    name="upload"
                    size={40}
                    className="mx-auto text-gray-400 mb-2"
                  />
                  <p className="text-gray-600 mb-2">
                    Kéo thả hình ảnh vào đây hoặc
                  </p>
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={installment?.status === InstallmentStatus.DELETED}
                  >
                    Chọn từ máy tính
                  </Button>
                  <p className="text-gray-500 text-sm mt-2">
                    Hỗ trợ các định dạng: JPG, PNG, PDF (tối đa 5MB)
                  </p>
                </div>
              </div>

              {/* Document gallery */}
              <div>
                <SectionHeader
                  icon={<Icon name="image" />}
                  title="Thư viện hình ảnh"
                  color="amber"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* Empty state */}
                  <EmptyState
                    message="Chưa có hình ảnh nào được tải lên"
                    className="col-span-full py-8"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div>
              {/* Lịch sử thao tác */}
              <div>
                <div className="flex items-center mb-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2"
                  >
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                  <h3 className="text-lg font-medium">Lịch sử thao tác</h3>
                </div>
                <div className="text-sm text-amber-600 italic mb-2">
                  *Lưu ý : Tiền khác đã được cộng vào tiền ghi có / ghi nợ
                </div>
                <div className="border rounded-md overflow-hidden">
                  {loadingHistory ? (
                    <div className="flex justify-center items-center py-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
                    </div>
                  ) : amountHistory.length === 0 ? (
                    <div className="flex justify-center items-center py-10">
                      <p className="text-gray-500">Chưa có lịch sử giao dịch</p>
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16 text-center"
                          >
                            STT
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                          >
                            Ngày
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                          >
                            Giao dịch viên
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right"
                          >
                            Số tiền ghi nợ
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right"
                          >
                            Số tiền ghi có
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-sm font-medium text-gray-700"
                          >
                            Nội dung
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {amountHistory.map((history, index) => (
                          <tr key={history.id}>
                            <td className="px-4 py-3 text-sm text-gray-700 text-center">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {formatHistoryDate(history.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              Admin
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                              {history.debitAmount > 0
                                ? formatCurrency(history.debitAmount)
                                : ""}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-green-600">
                              {history.creditAmount > 0
                                ? formatCurrency(history.creditAmount)
                                : ""}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {history.description}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-amber-50">
                          <td
                            colSpan={3}
                            className="px-4 py-2 text-sm font-medium text-right"
                          >
                            Tổng Tiền
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-right text-red-600">
                            {formatCurrency(
                              amountHistory.reduce(
                                (sum, h) => sum + h.debitAmount,
                                0,
                              ),
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-right text-green-600">
                            {formatCurrency(
                              amountHistory.reduce(
                                (sum, h) => sum + h.creditAmount,
                                0,
                              ),
                            )}
                          </td>
                          <td></td>
                        </tr>
                        <tr className="bg-amber-100">
                          <td
                            colSpan={3}
                            className="px-4 py-2 text-sm font-medium text-right"
                          >
                            Chênh lệch
                          </td>
                          <td
                            colSpan={2}
                            className="px-4 py-2 text-sm font-medium text-right"
                          >
                            <span
                              className={
                                amountHistory.reduce(
                                  (sum, h) =>
                                    sum + h.creditAmount - h.debitAmount,
                                  0,
                                ) >= 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {formatCurrency(
                                amountHistory.reduce(
                                  (sum, h) =>
                                    sum + h.creditAmount - h.debitAmount,
                                  0,
                                ),
                              )}
                            </span>
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "rotate" && (
            <div className="p-4 border rounded-md">
              <div>
                <p className="mb-4">
                  - Đảo Hợp Đồng là chức năng cho phép bạn đóng HĐ hiện tại và
                  tạo nhanh 1 hợp đồng mới
                  <br />- Hệ thống sẽ tự tính số tiền khách thực nhận về
                </p>

                <div className="font-medium text-lg mb-2">
                  Vui lòng nhập thông tin cho HĐ Trả Góp Mới:
                </div>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <div className="w-36 text-right mr-3">
                      <label className="text-sm font-medium">
                        Ngày vay <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="flex-1 max-w-xs">
                      <DatePicker
                        value={rotationLoanDate}
                        onChange={(date) => setRotationLoanDate(date)}
                        className="w-full"
                        disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                      />
                    </div>
                    <div className="ml-3 text-sm text-gray-500">
                      - Ngày vay của hợp đồng mới
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-36 text-right mr-3">
                      <label className="text-sm font-medium">
                        Số tiền vay <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="flex-1 max-w-xs">
                      <input
                        type="text"
                        className="border rounded p-2 w-full"
                        value={formatNumberWithDot(parseFormattedNumber(rotationLoanAmount))}
                        onChange={handleRotationLoanAmountChange}
                        disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                      />
                    </div>
                    <div className="ml-3 text-sm text-gray-500">
                      - Tổng tiền vay của hợp đồng mới
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-36 text-right mr-3">
                      <label className="text-sm font-medium">
                        Tiền đưa khách <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="flex-1 max-w-xs">
                      <input
                        type="text"
                        className="border rounded p-2 w-full"
                        value={formatNumberWithDot(parseFormattedNumber(rotationDownPayment))}
                        onChange={handleRotationDownPaymentChange}
                        disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                      />
                    </div>
                    <div className="ml-3 text-sm text-gray-500">
                      - Tiền đưa khách cho hợp đồng mới
                      <br />- Tiền này sẽ trừ đi số nợ còn lại của hợp đồng hiện
                      tại
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-36 text-right mr-3">
                      <label className="text-sm font-medium">
                        Thời gian vay <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="flex-1 max-w-xs">
                      <input
                        type="text"
                        className="border rounded p-2 w-full"
                        value={rotationDuration}
                        onChange={(e) => setRotationDuration(e.target.value)}
                        disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                      />
                    </div>
                    <div className="ml-3 text-sm text-gray-500">
                      Ngày =&gt; ( {parseFormattedNumber(rotationLoanAmount) /
                        parseInt(rotationDuration, 10) || 0
                        ? formatCurrency(
                            parseFormattedNumber(rotationLoanAmount) /
                              parseInt(rotationDuration, 10),
                          )
                        : formatCurrency(0)}
                      /1 ngày )
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-36 text-right mr-3">
                      <label className="text-sm font-medium">
                        Số ngày đóng tiền{" "}
                        <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <div className="flex-1 max-w-xs">
                      <input
                        type="text"
                        className="border rounded p-2 w-full"
                        value={rotationPaymentPeriod}
                        onChange={(e) => setRotationPaymentPeriod(e.target.value)}
                        disabled={installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                      />
                    </div>
                    <div className="ml-3 text-sm text-gray-500">
                      (VD : 3 ngày đóng 1 lần thì điền số 3 )
                    </div>
                  </div>

                  <div className="flex items-center font-medium text-lg text-red-600">
                    <div className="w-36 text-right mr-3">
                      Tiền khách thực nhận
                    </div>
                    <div className="flex-1 max-w-xs">
                      {formatCurrency(
                        parseFormattedNumber(rotationDownPayment),
                      )} {" "}
                      - {formatCurrency(
                        Math.max(0, calculateRemainingToPay(installment, calculateTotalPaidFromHistory())),
                        )} {" "}
                      - {formatCurrency(0 - (installment.debt_amount || 0))}
                      = {formatCurrency(calculateCustomerReceiveAmount())}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-center">
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                    onClick={handleRotateContract}
                    disabled={isRotating || installment.status === InstallmentStatus.CLOSED || installment.status === InstallmentStatus.DELETED}
                  >
                    {isRotating ? (
                      <>
                        <span className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block"></span>
                        Đang xử lý...
                      </>
                    ) : (
                      "Đảo Hợp Đồng"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "bad-debt" && (
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-medium mb-4">Báo xấu khách hàng</h3>
              <div className="text-center py-10 border rounded-md bg-gray-50">
                <p className="text-gray-500">Tính năng đang được phát triển</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
