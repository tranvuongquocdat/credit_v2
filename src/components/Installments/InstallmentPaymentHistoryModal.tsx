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
import { resetInstallmentDebtAmount } from "@/lib/installmentPayment";
import { getInstallmentById, updateInstallmentPaymentDueDate } from "@/lib/installment";
import { formatCurrency, formatDate, parseFormattedNumber } from "@/lib/utils";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { MoneyInput } from "@/components/ui/money-input";
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
import { 
  calculateTotalPaidFromHistory as calcTotalPaidFromHistory,
  calculateRemainingToPay,
  calculateRemainingPeriods as calcRemainingPeriods,
  calculateRatio
} from "@/lib/installmentCalculations";
import { supabase } from "@/lib/supabase";
import { getinstallmentPaymentHistory } from "@/lib/Installments/payment_history";
import { getExpectedMoney } from "@/lib/Installments/get_expected_money";
import { convertFromHistoryToTimeArrayWithStatus } from "@/lib/Installments/convert_from_history_to_time_array";
import { fillRemainingPeriods } from "@/lib/Installments/fill_remaining_periods";
import { getLatestPaymentPaidDate } from "@/lib/Installments/get_latest_payment_paid_date";
import { getCurrentUser } from "@/lib/auth";
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
  const [generatedPeriods, setGeneratedPeriods] = useState<InstallmentPaymentPeriod[]>([]);
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
    useState<string>(initialInstallment?.installment_amount?.toString() || "");
  const [rotationDownPayment, setRotationDownPayment] =
    useState<string>(initialInstallment?.amount_given?.toString() || "");
  const [rotationDuration, setRotationDuration] = useState<string>(initialInstallment?.duration?.toString() || "");
  const [rotationPaymentPeriod, setRotationPaymentPeriod] =
    useState<string>(initialInstallment?.payment_period?.toString() || "");

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
  const [payDebt, setPayDebt] = useState(true); // Track whether to pay debt or not

  // State for temporary edited values
  const [tempEditedDate, setTempEditedDate] = useState<string | null>(null);
  const [tempEditedAmount, setTempEditedAmount] = useState<number | null>(null);

  // State để track việc có thay đổi dữ liệu hay không
  const [hasDataChanged, setHasDataChanged] = useState(false);

  // Thêm state missing:
  const [isGenerating, setIsGenerating] = useState(false);

  // Add state for total paid amount
  const [totalPaidAmount, setTotalPaidAmount] = useState<number>(0);

  // State lưu số tiền đã đóng ( tính theo kỳ )
  const [totalPaidAmountByPeriod, setTotalPaidAmountByPeriod] = useState<number>(0);

  // Add state for debt amount
  const [debtAmount, setDebtAmount] = useState<number>(initialInstallment?.debt_amount || 0);

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
  const generatePeriodsFromExpectedMoney = useCallback(
    async (currentInstallmentId: string, sessionId: string) => {
      if (!currentInstallmentId) return;

      console.log('🔄 Generating periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney');
      setIsGenerating(true);
      setError(null);

      try {
        // 1. Get payment history from database - filter out deleted records
        const allPaymentHistory = await getinstallmentPaymentHistory(currentInstallmentId);
        const paymentHistory = allPaymentHistory.filter(record => !record.is_deleted);
        console.log('Payment history from DB:', paymentHistory.length, 'active records (', allPaymentHistory.length, 'total)');
        
        // 2. Get daily interest amounts using getExpectedMoney
        const dailyAmounts = await getExpectedMoney(currentInstallmentId);
        console.log('Daily amounts from getExpectedMoney:', dailyAmounts.length, 'days');
        
        // 3. Calculate loan end date
        const loanStartDate = installment?.start_date;
        if (!loanStartDate) {
          throw new Error('Missing loan start date');
        }
        
        const startDate = new Date(loanStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + dailyAmounts.length - 1);
        const loanEndDate = endDate.toISOString().split('T')[0];
        
        console.log('Loan period:', loanStartDate, '→', loanEndDate);
        
        // 4. Use convertFromHistoryToTimeArrayWithStatus to get periods and statuses
        const interestPeriod = installment?.payment_period || 30;
        const { periods: timePeriods, statuses } = convertFromHistoryToTimeArrayWithStatus(
          loanStartDate,
          loanEndDate,
          interestPeriod,
          paymentHistory,
          paymentHistory
        );
        
        console.log('Generated time periods:', timePeriods.length, 'periods');
        console.log('Statuses:', statuses);
        
        // 5. Calculate expected amount for each period using getExpectedMoney
        const allPeriods: InstallmentPaymentPeriod[] = [];
        const loanStart = new Date(loanStartDate);
        
        timePeriods.forEach((timePeriod, index) => {
          const [start_date, end_date] = timePeriod;
          const isChecked = statuses[index];
          const periodNumber = index + 1;
          
          // Calculate start and end day indices relative to loan start
          const periodStartDate = new Date(start_date);
          const periodEndDate = new Date(end_date);
          
          const startDayIndex = Math.floor((periodStartDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
          const endDayIndex = Math.floor((periodEndDate.getTime() - loanStart.getTime()) / (1000 * 60 * 60 * 24));
          
          // Calculate expected amount by summing daily amounts from getExpectedMoney
          let expectedAmount = 0;
          for (let dayIndex = startDayIndex; dayIndex <= endDayIndex && dayIndex < dailyAmounts.length; dayIndex++) {
            if (dayIndex >= 0) {
              expectedAmount += dailyAmounts[dayIndex];
            }
          }
          
          // Calculate actual amount based on history (use effective date to query correct period)
          let actualAmount = 0;
          let transactionDate = '';
          if (isChecked) {
            const periodPayments = paymentHistory.filter(payment => {
              const paymentDate = payment.effective_date?.split('T')[0] || '';
              const startDate = start_date.split('T')[0]; // Remove time part
              const endDate = end_date.split('T')[0];     // Remove time part
              
              return paymentDate >= startDate && paymentDate <= endDate;
            });
            
            actualAmount = periodPayments.reduce((sum, payment) => {
              return sum + (payment.credit_amount || 0) - (payment.debit_amount || 0);
            }, 0);
            transactionDate = periodPayments[0].transaction_date?.split('T')[0] || '';
          }
          
          const newPeriod: InstallmentPaymentPeriod = {
            id: isChecked ? `db-${periodNumber}` : `generated-${periodNumber}`,
            installmentId: currentInstallmentId,
            periodNumber: periodNumber,
            dueDate: periodStartDate.toISOString(),
            endDate: periodEndDate.toISOString(),
            expectedAmount: Math.round(expectedAmount),
            actualAmount: Math.round(actualAmount),
            paymentStartDate: isChecked ? transactionDate : undefined,
            isOverdue: false,
            daysOverdue: 0
          };
          
          allPeriods.push(newPeriod);
        });

        // Kiểm tra nếu modal session vẫn là session hiện tại
        if (sessionId !== modalSessionId.current) {
          console.log("Skipping stale periods update");
          return;
        }

        setGeneratedPeriods(allPeriods);
        console.log('✅ Generated', allPeriods.length, 'periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney');
        
      } catch (error) {
        console.error('Error generating periods:', error);
        setError("Không thể tải dữ liệu thanh toán");
      } finally {
        if (sessionId === modalSessionId.current) {
          setIsGenerating(false);
          setLoading(false);
        }
      }
    },
    [installment?.start_date, installment?.payment_period],
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
      generatePeriodsFromExpectedMoney(installment.id, currentSessionId);
    }
  }, [isOpen, installment?.id, generatePeriodsFromExpectedMoney]);

  // Generate periods using convertFromHistoryToTimeArrayWithStatus + getExpectedMoney
  useEffect(() => {
    if (isOpen && installment?.id) {
      console.log('Triggering period generation for installment:', installment.id);
      const currentSessionId = modalSessionId.current;
      generatePeriodsFromExpectedMoney(installment.id, currentSessionId);
    }
  }, [isOpen, installment?.id, generatePeriodsFromExpectedMoney, hasDataChanged]); // Add hasDataChanged to regenerate when data changes

  // Hàm reload thông tin hợp đồng
  const reloadInstallmentInfo = async () => {
    if (!installment?.id) return;

    const currentSessionId = modalSessionId.current;

    try {
      // Get full installment data including debt_amount
      const { data, error } = await getInstallmentById(installment.id);

      // Kiểm tra nếu session vẫn là session hiện tại
      if (currentSessionId !== modalSessionId.current) return;

      if (error) {
        throw error;
      }

      if (data) {
        // Ensure we explicitly update the debt_amount
        console.log('Reloaded installment data with debt_amount:', data.debt_amount);
        setInstallment(data);
        
        // Update debt amount state
        setDebtAmount(data.debt_amount || 0);
        
        // Force reload total paid amount
        const total = await calcTotalPaidFromHistory(data.id);
        setTotalPaidAmount(total);
        
        // Reload total paid by period
        const latestPaymentPaidDate = await getLatestPaymentPaidDate(data.id);
        if (latestPaymentPaidDate) {
          const latestPaidDate = new Date(latestPaymentPaidDate);
          const startDate = new Date(data.start_date); 
          const daysFromLatestPaymentPaidDate = Math.floor((latestPaidDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const totalPaidByPeriod = daysFromLatestPaymentPaidDate * (data?.installment_amount || 0) / data?.duration;
          setTotalPaidAmountByPeriod(totalPaidByPeriod);
        } else {
          setTotalPaidAmountByPeriod(0);
        }
        
        // Tải lại dữ liệu kỳ thanh toán khi thông tin hợp đồng thay đổi
        generatePeriodsFromExpectedMoney(data.id, currentSessionId);
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
  const calculateCombinedPaymentPeriods = useMemo((): InstallmentPaymentPeriod[] => {
    console.log('calculateCombinedPaymentPeriods called with generatedPeriods:', generatedPeriods.length);
    
    // Simply return the generated periods from getExpectedMoney approach
    return generatedPeriods;
  }, [generatedPeriods]);

  // Update useEffect to load and refresh total paid amount
  useEffect(() => {
    const loadTotalPaid = async () => {
      if (!installment?.id) return;
      try {
        const total = await calcTotalPaidFromHistory(installment.id);
        setTotalPaidAmount(total);
        const latestPaymentPaidDate = await getLatestPaymentPaidDate(installment.id);
        if (latestPaymentPaidDate) {
          const latestPaidDate = new Date(latestPaymentPaidDate);
          const startDate = new Date(installment.start_date); 
          const daysFromLatestPaymentPaidDate = Math.floor((latestPaidDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const totalPaidByPeriod = daysFromLatestPaymentPaidDate * (installment?.installment_amount || 0) / installment?.duration;
          setTotalPaidAmountByPeriod(totalPaidByPeriod);
        }
      } catch (err) {
        console.error("Error calculating total paid amount:", err);
      }
    };
    
    loadTotalPaid();
  }, [installment?.id, hasDataChanged]);

  // Calculate total paid amount from transaction history
  const calculateTotalPaidFromHistory = async (): Promise<number> => {
    return await calcTotalPaidFromHistory(installment.id);
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

  const isPeriodInDatabase = (
    period: InstallmentPaymentPeriod | undefined,
  ): boolean => {
    if (!period || !period.id) return false;
    // Updated logic: check if it starts with 'db-' and has actual amount
    return period.id.startsWith('db-') && Boolean(period.actualAmount && period.actualAmount > 0);
  };
  
  // Find the oldest unpaid period
  const findOldestUnpaidPeriodIndex = useMemo(() => {
    return calculateCombinedPaymentPeriods.findIndex(p => !isPeriodInDatabase(p));
  }, [calculateCombinedPaymentPeriods]);

  // Simplified checkbox handler using getLatestPaymentPaidDate and cycles
  const handleCheckboxChange = async (
    period: InstallmentPaymentPeriod,
    checked: boolean,
    index: number,
  ) => {
    if (!installment?.id || processingCheckbox) return;
    const { id: userId } = await getCurrentUser();
    
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
    }, 30000);
    
    try {
      if (checked) {
        // 1. Get latest payment date
        const latestPaymentDate = await getLatestPaymentPaidDate(installment.id);
        
        // 2. Determine start date for payment records
        let startDate: string;
        if (latestPaymentDate) {
          const nextDay = new Date(latestPaymentDate);
          nextDay.setDate(nextDay.getDate() + 1);
          startDate = nextDay.toISOString().split('T')[0];
        } else {
          startDate = installment.start_date || new Date().toISOString().split('T')[0];
        }
        
        // 3. Determine end date (end of selected period)
        const endDate = period.endDate ? 
          new Date(period.endDate.split('/').reverse().join('-')).toISOString().split('T')[0] :
          new Date(new Date(period.dueDate.split('/').reverse().join('-')).getTime() + (installment.payment_period - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        console.log(`Creating payment records from ${startDate} to ${endDate}`);
        
        // 4. Calculate total days and create cycles
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const totalDays = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        if (totalDays <= 0) {
          throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
        }
        
        // 5. Create cycles based on payment_period
        const paymentPeriod = installment.payment_period || 30;
        const cycles = [];
        
        let currentStart = new Date(startDateObj);
        
        while (currentStart <= endDateObj) {
          let currentEnd = new Date(currentStart);
          currentEnd.setDate(currentStart.getDate() + paymentPeriod - 1);
          
          if (currentEnd > endDateObj) {
            currentEnd = new Date(endDateObj);
          }
          
          cycles.push({
            start: new Date(currentStart),
            end: new Date(currentEnd)
          });
          
          currentStart = new Date(currentEnd);
          currentStart.setDate(currentStart.getDate() + 1);
        }
        
        console.log(`Created ${cycles.length} cycles:`, cycles.map(c => 
          `${c.start.toISOString().split('T')[0]} → ${c.end.toISOString().split('T')[0]}`
        ));
        
        // 6. Create records for each cycle
        const allRecords: Array<{
          installment_id: string;
          transaction_type: 'payment';
          effective_date: string;
          date_status: string | null;
          credit_amount: number;
          debit_amount: number;
          description: string;
          is_deleted: boolean;
          transaction_date?: string;
          created_by: string;
        }> = [];
        
        cycles.forEach((cycle, cycleIndex) => {
          const cycleStartDate = cycle.start;
          const cycleEndDate = cycle.end;
          const cycleDays = Math.floor((cycleEndDate.getTime() - cycleStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          // Use expected amount for equal distribution across cycle
          const totalAmount = (tempEditedAmount !== null && period.id === period.id) ? 
            tempEditedAmount : period.expectedAmount;
          const dailyAmount = Math.floor(totalAmount / cycleDays);
          const lastDayAdjustment = totalAmount - (dailyAmount * cycleDays);
          
          for (let dayOffset = 0; dayOffset < cycleDays; dayOffset++) {
            const currentDate = new Date(cycleStartDate);
            currentDate.setDate(cycleStartDate.getDate() + dayOffset);
            
            // Determine date_status for this cycle
            let dateStatus: string | null = null;
            if (cycleDays === 1) {
              dateStatus = 'only';
            } else if (dayOffset === 0) {
              dateStatus = 'start';
            } else if (dayOffset === cycleDays - 1) {
              dateStatus = 'end';
            }
            
            // Calculate amount for this day
            let dayAmount = dailyAmount;
            if (dayOffset === cycleDays - 1) {
              dayAmount = dailyAmount + lastDayAdjustment;
            }
            const transactionDate = selectedDate 
            ? new Date(selectedDate)
            : new Date().setUTCHours(0, 0, 0, 0);
            const dailyRecord = {
              installment_id: installment.id,
              transaction_type: 'payment' as const,
              effective_date: currentDate.toISOString(),
              date_status: dateStatus,
              credit_amount: dayAmount,
              debit_amount: 0,
              description: `Thanh toán chu kỳ ${cycleIndex + 1}/${cycles.length}, ngày ${dayOffset + 1}/${cycleDays} đến kỳ ${period.periodNumber}`,
              is_deleted: false,
              created_by: userId || installment.employee_id,
              transaction_date: new Date(transactionDate).toISOString(),
            };
            
            allRecords.push(dailyRecord);
          }
        });
        
        console.log(`Prepared ${allRecords.length} daily records for batch insert`);
        
        // 7. Batch upsert all records
        const { data, error } = await supabase
          .from('installment_history')
          .upsert(allRecords)
          .select();
        
        if (error) {
          throw new Error(error.message);
        }
        
        console.log(`Successfully inserted ${allRecords.length} payment records`);
        
        // Update payment_due_date
        const updatedLatestPaidDate = await getLatestPaymentPaidDate(installment.id);
        if (updatedLatestPaidDate) {
          const latestPaidDateObj = new Date(updatedLatestPaidDate);
          const endDate = new Date(installment.loan_date || '');
          endDate.setDate(endDate.getDate() + (installment.loan_period || 0) - 1);
          if (latestPaidDateObj.getTime() >= endDate.getTime()) {
            await updateInstallmentPaymentDueDate(installment.id, null);
          } else {
            const newDueDate = new Date(latestPaidDateObj);
            newDueDate.setDate(newDueDate.getDate() + installment.payment_period);
            await updateInstallmentPaymentDueDate(installment.id, newDueDate.toISOString());
          }
        }
        toast({
          title: 'Thành công',
          description: `Đã tạo ${allRecords.length} bản ghi thanh toán đến kỳ ${period.periodNumber}`,
        });
        
      } else {
        // Uncheck logic - only allow unchecking latest period
        const checkedPeriods = calculateCombinedPaymentPeriods.filter(p => isPeriodInDatabase(p));
        checkedPeriods.sort((a, b) => b.periodNumber - a.periodNumber);
        
        if (checkedPeriods.length > 0 && checkedPeriods[0].periodNumber !== period.periodNumber) {
          toast({
            variant: "destructive",
            title: "Không thể bỏ đánh dấu",
            description: `Bạn chỉ có thể bỏ đánh dấu kỳ ${checkedPeriods[0].periodNumber} (kỳ thanh toán gần nhất).`
          });
          return;
        }
        
        // Soft delete records in this period's date range
        const startDate = new Date(period.dueDate.split('/').reverse().join('-'));
        const endDate = period.endDate ? 
          new Date(period.endDate.split('/').reverse().join('-')) : 
          new Date(startDate.getTime() + (installment.payment_period - 1) * 24 * 60 * 60 * 1000);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('installment_history')
          .update({ is_deleted: true, updated_by: userId })
          .eq('installment_id', installment.id)
          .eq('transaction_type', 'payment')
          .eq('is_deleted', false)
          .gte('effective_date', startDateStr)
          .lte('effective_date', endDateStr + 'T23:59:59Z')
          .select();
        
        if (error) {
          throw new Error(error.message);
        }
        
        toast({
          title: 'Thành công',
          description: `Đã xóa ${data?.length || 0} bản ghi thanh toán cho kỳ ${period.periodNumber}`,
        });
      }
      
      // Reload data
      await reloadInstallmentInfo();
      setHasDataChanged(true);
      
    } catch (error) {
      console.error('Error handling payment records:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể xử lý bản ghi thanh toán',
        variant: 'destructive'
      });
    } finally {
      clearTimeout(timeoutId);
      setProcessingCheckbox(false);
      setProcessingPeriodId(null);
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
    const downPayment = parseFloat(rotationDownPayment) || 0;
    const amountToPay = Math.max(0, calculateRemainingToPay(installment, totalPaidAmount));
    const remainingDebt = 0 - (debtAmount || 0);

    // Customer receives: downPayment - remainingDebt
    return downPayment - amountToPay - remainingDebt;
  };

  // Handler for rotating the contract (creating a new one and closing the current)
  const handleRotateContract = async () => {
    if (!installment?.id || !installment?.customer_id) return;

    setIsRotating(true); // Set loading state

    try {
      // Import necessary functions
      const { updateInstallmentStatus } = await import("@/lib/installmentPayment");
      const { createInstallment } = await import("@/lib/installment");
      const { recordContractRotation, recordDebtPayment, recordContractClosure } = await import(
        "@/lib/installmentAmountHistory"
      );

      // Ghi lại lịch sử thanh toán nợ (nếu có)
      if (debtAmount) {
        await recordDebtPayment(installment.id, installment.employee_id, debtAmount);
      }

      // Reset debt amount to 0
      await resetInstallmentDebtAmount(installment.id);

      // Check if there are remaining unpaid periods and fill them before closing
      const remainingAmount = calculateRemainingToPay(installment, totalPaidAmount);
      
      if (remainingAmount > 0) {
        console.log('🔄 Filling remaining periods before closing contract for rotation. Remaining amount:', remainingAmount);
        
        // Fill all remaining unpaid periods
        const fillResult = await fillRemainingPeriods(installment.id);
        
        if (!fillResult.success) {
          throw new Error(fillResult.error || 'Failed to fill remaining periods');
        }
        
        console.log('✅ Successfully filled', fillResult.periodsAdded, 'remaining periods before rotation');
        
        if (fillResult.periodsAdded && fillResult.periodsAdded > 0) {
          toast({
            title: "Thông báo",
            description: `Đã tự động đóng ${fillResult.periodsAdded} kỳ còn lại trước khi đảo hợp đồng.`,
          });
        }
      }

      // Update installment status to closed
      await updateInstallmentStatus(installment.id, InstallmentStatus.CLOSED);

      // Record in transaction history
      await recordContractClosure(installment.id);
      
      // Create a new contract
      const newContract = {
        customer_id: installment.customer_id,
        employee_id: installment.employee_id,
        contract_code: `${installment.contract_code}-R`, // Add "R" suffix for rotated
        down_payment: parseFloat(rotationDownPayment) || 0,
        installment_amount: parseFloat(rotationLoanAmount) || 0,
        loan_period: parseInt(rotationDuration, 10),
        payment_period: parseInt(rotationPaymentPeriod, 10),
        loan_date: rotationLoanDate,
        notes: `Đảo từ hợp đồng ${installment.contract_code}. Khách thực nhận: ${formatCurrency(calculateCustomerReceiveAmount())}`,
        status: InstallmentStatus.ON_TIME,
        payment_due_date: '', // Add payment_due_date property
      };
      // Calculate initial payment_due_date as start_date + paymentPeriod - 1
      const startDateObj = new Date(rotationLoanDate);
      const paymentDueDate = new Date(startDateObj);
      paymentDueDate.setDate(startDateObj.getDate() + newContract.payment_period - 1);
      newContract.payment_due_date = format(paymentDueDate, 'yyyy-MM-dd');
      const { data, error } = await createInstallment(newContract);

      if (error) {
        throw error;
      }

      // Record rotation in transaction history
      if (data) {
        await recordContractRotation(data.id);
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
  const showCloseInstallmentConfirmation = (shouldPayDebt: boolean = true) => {
    setPayDebt(shouldPayDebt);
    setIsCloseContractConfirmOpen(true);
  };

  // Handler for closing the installment
  const handleCloseInstallment = async () => {
    if (!installment?.id) return;
    
    // Close the confirmation dialog
    setIsCloseContractConfirmOpen(false);

    try {
      // Import necessary functions
      const { updateInstallmentStatus } = await import("@/lib/installmentPayment");
      const { recordContractClosure } = await import("@/lib/installmentAmountHistory");

      // Check if there are remaining unpaid periods
      const remainingAmount = calculateRemainingToPay(installment, totalPaidAmount);
      
      
      // Ghi lại lịch sử thanh toán nợ (nếu có và được chọn thanh toán)
      if (debtAmount && payDebt) {
        await recordDebtPayment(installment.id, installment.employee_id, debtAmount);
      }
      
      // Reset debt amount to 0 only if paying debt
      if (payDebt) {
        await resetInstallmentDebtAmount(installment.id);
      }

      // Update installment status to closed
      await updateInstallmentStatus(installment.id, InstallmentStatus.CLOSED);

      // Record in transaction history
      if (remainingAmount > 0) {
        console.log('🔄 Filling remaining periods before closing contract. Remaining amount:', remainingAmount);
        
        // Fill all remaining unpaid periods
        const fillResult = await fillRemainingPeriods(installment.id);
        
        if (!fillResult.success) {
          throw new Error(fillResult.error || 'Failed to fill remaining periods');
        }
        
        console.log('✅ Successfully filled', fillResult.periodsAdded, 'remaining periods');
        
        if (fillResult.periodsAdded && fillResult.periodsAdded > 0) {
          toast({
            title: "Thành công",
            description: `Đã tự động đóng ${fillResult.periodsAdded} kỳ còn lại trước khi đóng hợp đồng.`,
          });
        }
      }
      await recordContractClosure(installment.id);
      
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
        description: payDebt 
          ? "Hợp đồng đã được đóng và thanh toán nợ thành công!"
          : "Hợp đồng đã được đóng thành công (giữ nguyên nợ cũ)!",
      });
    } catch (error) {
      console.error("Error closing installment:", error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Có lỗi xảy ra khi đóng hợp đồng. Vui lòng thử lại.",
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
                    <td className="py-1 px-2 border font-bold">{debtAmount && debtAmount > 0 ? "Tiền thừa" : "Nợ cũ"}</td>
                    <td className="py-1 px-2 text-right border text-red-600" colSpan={2}>
                      {formatCurrency(
                        Math.abs(debtAmount || 0),
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
                      {formatCurrency(totalPaidAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">
                      Còn lại phải đóng
                    </td>
                    <td className="py-1 px-2 text-right border text-red-600">
                      {formatCurrency(
                        calculateRemainingToPay(installment, totalPaidAmount)
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
            <div className="relative">
              {/* Generation loading indicator */}
              {isGenerating && (
                <div className="flex items-center justify-center p-4 mb-4 bg-blue-50 border border-blue-200 rounded">
                  <div className="h-4 w-4 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-2"></div>
                  <span className="text-blue-700">Đang tạo kỳ thanh toán...</span>
                </div>
              )}
              
              {/* Processing overlay */}
              {processingCheckbox && (
                <div className="absolute inset-0 bg-white bg-opacity-70 z-10 flex items-center justify-center">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-lg">
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-blue-600 animate-spin mr-3"></div>
                      <span className="text-blue-700 font-medium">Đang xử lý thanh toán...</span>
                    </div>
                  </div>
                </div>
              )}

            <PaymentTab
                loading={loading || isGenerating}
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
            </div>
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
                      <td className="px-4 py-2 border">Đã đóng (kỳ)</td>
                      <td className="px-4 py-2 text-right border text-green-600">
                        {formatCurrency(totalPaidAmountByPeriod)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border font-bold">Nợ cũ</td>
                      <td className="px-4 py-2 text-right border text-red-600" colSpan={2}>
                        {formatCurrency(
                          (0 - (debtAmount || 0)),
                        )}
                      </td>
                    </tr>

                    <tr className="bg-red-50">
                      <td className="px-4 py-3 font-medium border text-red-700">
                        Còn lại phải đóng để đóng hợp đồng
                      </td>
                      <td className="px-4 py-3 text-right border font-bold text-red-700 text-lg">
                        {formatCurrency(
                          (installment?.installment_amount || 0)   - totalPaidAmountByPeriod - (debtAmount || 0)
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-center">
                {/* Show single button if no old debt or contract is already closed */}
                {(debtAmount === 0 || installment?.status === InstallmentStatus.CLOSED || installment?.status === InstallmentStatus.DELETED) ? (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                    onClick={() => showCloseInstallmentConfirmation(true)}
                    disabled={installment?.status === InstallmentStatus.CLOSED || installment?.status === InstallmentStatus.DELETED}
                  >
                    {installment?.status === InstallmentStatus.CLOSED ? "Hợp đồng đã đóng" : 
                     installment?.status === InstallmentStatus.DELETED ? "Hợp đồng đã xóa" : "Đóng HĐ"}
                  </Button>
                ) : (
                  /* Show two buttons if there's old debt */
                  <div className="flex gap-4">
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                      onClick={() => showCloseInstallmentConfirmation(true)}
                    >
                      Đóng HĐ và trả nợ
                    </Button>
                    <Button
                      className="bg-orange-600 hover:bg-orange-700 text-white px-6"
                      onClick={() => showCloseInstallmentConfirmation(false)}
                    >
                      Đóng HĐ và không trả nợ
                    </Button>
                  </div>
                )}
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
                      <div className="space-y-3">
                        <p>Bạn có chắc chắn muốn đóng hợp đồng này không? Hành động này sẽ đánh dấu tất cả các kỳ còn lại là đã thanh toán và chuyển trạng thái hợp đồng thành "Đóng".</p>
                        
                        {debtAmount !== 0 && (
                          <div className="bg-gray-50 p-3 rounded">
                            <p className="text-sm">
                              <strong>Nợ cũ:</strong> {payDebt 
                                ? `Sẽ thanh toán nợ cũ ${formatCurrency(Math.abs(debtAmount))}` 
                                : `Sẽ giữ nguyên nợ cũ ${formatCurrency(Math.abs(debtAmount))}`}
                            </p>
                          </div>
                        )}
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Hủy</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => handleCloseInstallment()}
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
                        {(() => {
                          // Tạo danh sách records mở rộng với các bản ghi hủy
                          const expandedHistory: Array<{
                            id: string;
                            createdAt: string;
                            transactionType: string;
                            debitAmount: number;
                            creditAmount: number;
                            description: string;
                            isCancel?: boolean;
                          }> = [];

                          amountHistory.forEach(history => {
                            // Thêm bản ghi gốc
                            expandedHistory.push({
                              id: history.id,
                              createdAt: history.createdAt,
                              transactionType: history.transactionType,
                              debitAmount: history.debitAmount,
                              creditAmount: history.creditAmount,
                              description: history.description
                            });

                            if (history.transactionType === 'payment' && history.is_deleted === true) {
                              expandedHistory.push({
                                id: `${history.id}-cancel`,
                                createdAt: history.updated_at || '',
                                transactionType: 'payment_cancel',
                                debitAmount: history.creditAmount || 0,
                                creditAmount: 0,
                                description: `Hủy đóng lãi phí - ${history.description || ''}`,
                                isCancel: true
                              });
                            }
                          });

                          // Sắp xếp theo thời gian
                          expandedHistory.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                          // Render table rows
                          const tableRows = expandedHistory.map((record, index) => (
                            <tr key={record.id} className={record.transactionType === 'payment_cancel' ? 'bg-red-50' : ''}>
                              <td className="px-4 py-3 text-sm text-gray-700 text-center">
                                {index + 1}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {formatHistoryDate(record.createdAt)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {record.transactionType === 'payment_cancel' ? 'Hủy thanh toán' : 'Admin'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                                {record.debitAmount > 0
                                  ? formatCurrency(record.debitAmount)
                                  : ""}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-green-600">
                                {record.creditAmount > 0
                                  ? formatCurrency(record.creditAmount)
                                  : ""}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {record.description}
                              </td>
                            </tr>
                          ));

                          // Calculate totals from expanded history
                          const totalDebit = expandedHistory.reduce((sum, h) => sum + h.debitAmount, 0);
                          const totalCredit = expandedHistory.reduce((sum, h) => sum + h.creditAmount, 0);
                          const balance = totalCredit - totalDebit;

                          // Return both table rows and summary rows
                          return [
                            ...tableRows,
                            <tr key="total-row" className="bg-amber-50">
                              <td
                                colSpan={3}
                                className="px-4 py-2 text-sm font-medium text-right"
                              >
                                Tổng Tiền
                              </td>
                              <td className="px-4 py-2 text-sm font-medium text-right text-red-600">
                                {formatCurrency(totalDebit)}
                              </td>
                              <td className="px-4 py-2 text-sm font-medium text-right text-green-600">
                                {formatCurrency(totalCredit)}
                              </td>
                              <td></td>
                            </tr>,
                            <tr key="balance-row" className="bg-amber-100">
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
                                  className={balance >= 0 ? "text-green-600" : "text-red-600"}
                                >
                                  {formatCurrency(balance)}
                                </span>
                              </td>
                              <td></td>
                            </tr>
                          ];
                        })()}
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
                      <MoneyInput 
                        value={rotationLoanAmount}
                        onChange={(e) => setRotationLoanAmount(e.target.value)}
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
                      <MoneyInput 
                        value={rotationDownPayment}
                        onChange={(e) => setRotationDownPayment(e.target.value)}
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
                      Ngày =&gt; ( {(parseFloat(rotationLoanAmount) || 0) /
                        parseInt(rotationDuration, 10) || 0
                        ? formatCurrency(
                            (parseFloat(rotationLoanAmount) || 0) /
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
                        Math.max(0, calculateRemainingToPay(installment, totalPaidAmount)),
                        )} {" "}
                      - {formatCurrency(0 - (debtAmount || 0))}
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
