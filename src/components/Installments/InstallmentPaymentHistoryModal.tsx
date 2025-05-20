'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, ChevronDown } from 'lucide-react';
import { InstallmentWithCustomer, InstallmentStatus } from '@/models/installment';
import { InstallmentPaymentPeriod } from '@/models/installmentPayment';
import { getInstallmentPaymentPeriods } from '@/lib/installmentPayment';
import { getInstallmentById } from '@/lib/installment';
import { formatCurrency } from '@/lib/utils';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/use-toast';
import { DatePicker } from '@/components/ui/date-picker';

// Define the tabs for this modal
export type TabId = 'payment' | 'principal-repayment' | 'close' | 'documents' | 'history' | 'bad-debt';

export const DEFAULT_INSTALLMENT_TABS = [
  { id: 'payment' as TabId, label: 'Đóng lãi phí' },
  { id: 'close' as TabId, label: 'Đóng HĐ' },
  { id: 'documents' as TabId, label: 'Chứng từ' },
  { id: 'history' as TabId, label: 'Lịch sử' },
  { id: 'bad-debt' as TabId, label: 'Báo xấu khách hàng' }
];

interface CreditActionTabsProps {
  tabs: { id: TabId; label: string }[];
  activeTab: string;
  onChangeTab: (tabId: TabId) => void;
  variant?: 'default' | 'scrollable';
  className?: string;
}

// Tab component
export function CreditActionTabs({
  tabs,
  activeTab,
  onChangeTab,
  variant = 'default',
  className = ''
}: CreditActionTabsProps) {
  const isScrollable = variant === 'scrollable';
  
  return (
    <div className={`border-b ${isScrollable ? 'overflow-x-auto' : ''} ${className}`}>
      <div className={`flex ${isScrollable ? 'flex-wrap' : ''}`} style={{ minWidth: isScrollable ? '650px' : 'auto' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChangeTab(tab.id as TabId)}
            className={`px-4 py-2 transition-all ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
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
  onClose: () => void;
  installment: InstallmentWithCustomer;
}

export function InstallmentPaymentHistoryModal({
  isOpen,
  onClose,
  installment: initialInstallment
}: InstallmentPaymentHistoryModalProps) {
  // State variables
  const [installment, setInstallment] = useState<InstallmentWithCustomer>(initialInstallment);
  const installmentId = installment?.id || '';
  const [paymentPeriods, setPaymentPeriods] = useState<InstallmentPaymentPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('payment'); // Tab mặc định là "Đóng lãi phí"
  
  // State cho chỉnh sửa thanh toán
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  
  // State for date editing
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [selectedDatePeriodId, setSelectedDatePeriodId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Cập nhật state installment khi initialInstallment thay đổi
  useEffect(() => {
    setInstallment(initialInstallment);
    console.log('Installment data:', initialInstallment);
  }, [initialInstallment]);

  // Hàm reload thông tin hợp đồng
  const reloadInstallmentInfo = async () => {
    if (!installment?.id) return;
    
    try {
      const { data, error } = await getInstallmentById(installment.id);
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setInstallment(data);
      }
    } catch (err) {
      console.error('Error reloading installment info:', err);
    }
  };

  // Load payment periods when the modal opens
  useEffect(() => {
    async function loadPaymentPeriods() {
      if (!installment?.id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await getInstallmentPaymentPeriods(installment.id);
        
        if (error) {
          throw error;
        }
        
        // Set payment periods directly from data
        setPaymentPeriods(data || []);
      } catch (err) {
        console.error('Error loading payment periods:', err);
        setError('Không thể tải dữ liệu thanh toán');
      } finally {
        setLoading(false);
      }
    }
    
    if (isOpen) {
      loadPaymentPeriods();
    }
  }, [isOpen, installment?.id]);
  
  // Format date helper
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd-MM-yyyy', { locale: vi });
    } catch (error) {
      return '-';
    }
  };
  
  // Hàm tính chính xác số ngày giữa hai ngày (inclusive)
  const calculateDaysBetween = (startDate: Date, endDate: Date): number => {
    // Chuẩn hóa về đầu ngày để tránh sai lệch do giờ/phút/giây
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    
    // Tính ngày (bao gồm cả ngày đầu và cuối)
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };
  
  // Tính toán số tiền trả góp nếu không có trong DB
  const installmentAmount = installment?.installment_amount || 
    (installment?.amount_given && installment?.interest_rate 
      ? installment.amount_given * (1 + installment.interest_rate / 100)
      : 0);
  
  // Calculate total expected amount from payment periods
  const totalExpected = paymentPeriods.length > 0 
    ? paymentPeriods.reduce((sum, period) => sum + (period.expectedAmount || 0), 0)
    : installmentAmount - (installment?.amount_given || 0);
  
  // Calculate total paid amount from payment periods
  const totalPaid = paymentPeriods.reduce((sum, period) => sum + (period.actualAmount || 0), 0);
  
  // Calculate remaining amount
  const databasePeriods = paymentPeriods.filter(p => !p.id.startsWith('calculated-'));
  const totalFees = databasePeriods.length > 0 
    ? databasePeriods.reduce((sum, period) => sum + period.expectedAmount, 0)
    : totalExpected;
  const totalCustomerPayments = databasePeriods.reduce((sum, period) => sum + (period.actualAmount || 0), 0);
  const remainingAmount = totalCustomerPayments - totalFees;
  
  // Helper function để format số thành định dạng có dấu chấm ngăn cách hàng nghìn
  const formatNumberWithDot = (num: number): string => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };
  
  // Kiểm tra xem kỳ đã có dữ liệu trong DB chưa
  const isPeriodInDatabase = (period: InstallmentPaymentPeriod | undefined): boolean => {
    if (!period || !period.id) return false;
    return !period.id.startsWith('calculated-') && Boolean(period.actualAmount);
  };
  
  // Bắt đầu chỉnh sửa khoản thanh toán
  const handleStartEditing = (period: InstallmentPaymentPeriod) => {
    // Không sửa khoản đã thanh toán
    if (isPeriodInDatabase(period)) return;
    
    setSelectedPeriodId(period.id);
    // Đặt giá trị mặc định là số tiền lãi phí dự kiến
    setPaymentAmount(period.expectedAmount || 0);
  };
  
  // Lưu khoản thanh toán
  const handleSavePayment = async (period: InstallmentPaymentPeriod) => {
    if (!installment?.id) return;
    
    try {
      // Import necessary functions
      const { 
        saveInstallmentPayment
      } = await import('@/lib/installmentPayment');

      const today = new Date().toISOString().split('T')[0];
      const isCalculatedPeriod = period.id.startsWith('calculated-');
      
      if (isCalculatedPeriod) {
        // Nếu là kỳ tính toán, tạo mới kỳ trong DB
        await saveInstallmentPayment(
          installment.id,
          period,
          paymentAmount,
          true // isCalculatedPeriod
        );
      } else {
        // Nếu là kỳ đã có trong DB, cập nhật
        await saveInstallmentPayment(
          installment.id,
          period,
          paymentAmount,
          false // isCalculatedPeriod
        );
      }
      
      // Cập nhật UI
      const updatedPeriods = paymentPeriods.map(p => {
        if (p.id === period.id) {
          return {
            ...p,
            actualAmount: paymentAmount,
            paymentDate: today
          };
        }
        return p;
      });
      
      setPaymentPeriods(updatedPeriods);
      setSelectedPeriodId(null);
      
      // Hiển thị thông báo thành công
      toast({
        title: "Lưu thành công",
        description: "Đã cập nhật khoản thanh toán",
      });
      
      // Reset form
      setPaymentAmount(0);
      
      // Refresh dữ liệu
      if (installment?.id) {
        const { data, error } = await getInstallmentPaymentPeriods(installment.id);
        if (!error && data) {
          setPaymentPeriods(data);
        }
      }
      
    } catch (error) {
      console.error('Error saving payment:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi lưu thanh toán. Vui lòng thử lại."
      });
    }
  };
  
  // Handle date selection
  const handleStartDateEditing = (period: InstallmentPaymentPeriod) => {
    // Không sửa khoản đã thanh toán
    if (isPeriodInDatabase(period)) return;
    
    setSelectedDatePeriodId(period.id);
    setIsEditingDate(true);
    
    // Set default date to period start date if not already set
    const dateValue = period.paymentDate 
      ? period.paymentDate.split('/').reverse().join('-') 
      : period.dueDate.split('/').reverse().join('-');
    
    setSelectedDate(dateValue);
  };
  
  // Save selected date
  const handleSaveDate = async (period: InstallmentPaymentPeriod, dateValue: string) => {
    if (!installment?.id || !dateValue) return;
    
    try {
      const { saveInstallmentPayment } = await import('@/lib/installmentPayment');
      
      // Format date to ISO string (YYYY-MM-DD)
      const formattedDate = dateValue;
      const isCalculatedPeriod = period.id.startsWith('calculated-');
      
      // Call API to save the date
      await saveInstallmentPayment(
        installment.id,
        {
          ...period,
          paymentDate: formattedDate
        },
        period.actualAmount || 0,
        isCalculatedPeriod
      );
      
      // Update UI
      const updatedPeriods = paymentPeriods.map(p => {
        if (p.id === period.id) {
          return {
            ...p,
            paymentDate: format(new Date(formattedDate), 'dd/MM/yyyy')
          };
        }
        return p;
      });
      
      setPaymentPeriods(updatedPeriods);
      setSelectedDatePeriodId(null);
      setIsEditingDate(false);
      
      // Show success message
      toast({
        title: "Thành công",
        description: "Đã cập nhật ngày giao dịch",
      });
      
      // Refresh data from server
      if (installment?.id) {
        const { data, error } = await getInstallmentPaymentPeriods(installment.id);
        if (!error && data) {
          setPaymentPeriods(data);
        }
      }
    } catch (error) {
      console.error('Error saving payment date:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi cập nhật ngày giao dịch. Vui lòng thử lại."
      });
    }
  };

  // Tính toán danh sách kỳ dự kiến kết hợp với kỳ đã có trong database
  const calculateCombinedPaymentPeriods = (): InstallmentPaymentPeriod[] => {
    // Nếu không có dữ liệu hợp đồng, trả về mảng rỗng
    if (!installment || !installment.duration || !installment.payment_period || !installment.start_date) {
      return paymentPeriods;
    }
    
    // Tính toán số kỳ dự kiến dựa theo loan_period và payment_period
    const loanPeriod = installment.duration; // Thời gian vay (ngày)
    const paymentPeriod = installment.payment_period; // Thời gian mỗi kỳ (ngày)
    const totalPeriods = Math.ceil(loanPeriod / paymentPeriod); // Tổng số kỳ
    
    // Nếu đã có dữ liệu từ DB, kiểm tra xem đã đủ số kỳ chưa
    if (paymentPeriods.length > 0) {
      // Tìm kỳ có periodNumber lớn nhất trong dữ liệu hiện tại
      const maxPeriodNumber = Math.max(...paymentPeriods.map(p => p.periodNumber));
      
      // Nếu đã đủ số kỳ, trả về paymentPeriods
      if (maxPeriodNumber >= totalPeriods) {
        return paymentPeriods;
      }
      
      // Nếu chưa đủ số kỳ, cần tạo thêm các kỳ còn thiếu
      // Sử dụng lại code tính toán bên dưới để tạo các kỳ còn thiếu
      console.log("Cần tạo thêm các kỳ từ", maxPeriodNumber + 1, "đến", totalPeriods);
    }
    
    // Lấy dữ liệu cần thiết từ installment
    const amountGiven = installment.amount_given || 0;
    const interestRate = installment.interest_rate || 0;
    const installmentAmount = installment.installment_amount || 0;
    const duration = installment.duration || 1;
    
    // Tổng tiền trả góp - ưu tiên dùng installment_amount nếu có
    const totalInstallmentAmount = installmentAmount > 0 
      ? installmentAmount 
      : amountGiven * (1 + interestRate / 100);
    
    // Tính tiền mỗi ngày
    const dailyAmount = totalInstallmentAmount / duration;
    
    // Tạo danh sách kỳ dự kiến hoặc chỉ các kỳ còn thiếu
    const calculatePeriods: InstallmentPaymentPeriod[] = [];
    const startDate = new Date(installment.start_date);
    
    // Nếu đã có dữ liệu DB, tạo một map để kiểm tra
    const existingPeriods = new Map<number, InstallmentPaymentPeriod>();
    paymentPeriods.forEach(period => {
      existingPeriods.set(period.periodNumber, period);
    });
    
    let currentDate = new Date(startDate);
    let remainingDays = loanPeriod;
    
    for (let i = 0; i < totalPeriods; i++) {
      const periodNumber = i + 1;
      
      // Nếu kỳ này đã có trong DB, sử dụng dữ liệu từ DB
      if (existingPeriods.has(periodNumber)) {
        calculatePeriods.push(existingPeriods.get(periodNumber)!);
        
        // Cập nhật ngày hiện tại để tính kỳ tiếp theo
        if (i < totalPeriods - 1) {
          const periodDays = installment.payment_period || 30;
          currentDate.setDate(currentDate.getDate() + periodDays);
          remainingDays -= periodDays;
        }
        
        continue;
      }
      
      // Tính ngày của kỳ này
      const dueDate = new Date(currentDate);
      
      // Tính toán số ngày của kỳ
      let periodDays = installment.payment_period || 30;
      if (i === totalPeriods - 1) {
        // Last period - may be shorter
        const totalDays = installment.duration || 0;
        const previousDays = i * periodDays;
        periodDays = Math.max(1, totalDays - previousDays);
      }
      
      // Tính ngày kết thúc kỳ
      const endDate = new Date(dueDate);
      endDate.setDate(endDate.getDate() + periodDays - 1);
      
      // Tính số tiền dự kiến cho kỳ này dựa trên số ngày của kỳ
      const expectedAmount = Math.round(dailyAmount * periodDays);
      
      // Thêm vào danh sách kỳ dự kiến
      calculatePeriods.push({
        id: `calculated-${periodNumber}`,
        installmentId: installment.id,
        periodNumber,
        dueDate: format(dueDate, 'dd/MM/yyyy'),
        paymentDate: format(dueDate, 'dd/MM/yyyy'), // Mặc định ngày giao dịch là ngày đầu kỳ
        expectedAmount,
        actualAmount: 0, // Add default actualAmount
        isOverdue: dueDate < new Date(),
        daysOverdue: dueDate < new Date() ? calculateDaysBetween(dueDate, new Date()) : 0
      });
      
      // Cập nhật ngày bắt đầu cho kỳ tiếp theo
      currentDate = new Date(endDate);
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Giảm số ngày còn lại
      remainingDays -= periodDays;
    }
    
    return calculatePeriods;
  };

  // Xử lý checkbox đánh dấu đã thanh toán
  const handleCheckboxChange = async (period: InstallmentPaymentPeriod, checked: boolean, index: number) => {
    console.log("handleCheckboxChange called with:", { period, checked, index });
    
    if (!installment?.id) {
      console.error("No installment id found");
      return;
    }
    
    if (!period) {
      console.error("Period is undefined");
      return;
    }
    
    if (!period.id) {
      console.error("Period id is undefined", period);
      return;
    }
    
    try {
      // Import necessary functions
      const { 
        saveInstallmentPayment,
        deleteInstallmentPaymentPeriod
      } = await import('@/lib/installmentPayment');

      if (checked) {
        // Lấy tất cả các kỳ từ calculateCombinedPaymentPeriods
        const allPeriods = calculateCombinedPaymentPeriods();
        
        // Tìm các kỳ cần đánh dấu: từ kỳ đầu tiên chưa thanh toán cho đến kỳ hiện tại
        const periodsToUpdate: InstallmentPaymentPeriod[] = [];
        
        for (let i = 0; i <= index; i++) {
          const p = allPeriods[i];
          if (p && !isPeriodInDatabase(p)) {
            periodsToUpdate.push(p);
          }
        }
        
        // Nếu không có kỳ nào cần cập nhật, thoát sớm
        if (periodsToUpdate.length === 0) {
          return;
        }
        
        console.log("Các kỳ sẽ được cập nhật:", periodsToUpdate);
        
        // Xử lý từng kỳ cần đánh dấu là đã thanh toán
        for (const periodToUpdate of periodsToUpdate) {
          const isCalculatedPeriod = periodToUpdate.id.startsWith('calculated-');
          
          // Lưu kỳ vào DB với số tiền dự kiến
          await saveInstallmentPayment(
            installment.id,
            periodToUpdate,
            periodToUpdate.expectedAmount,
            isCalculatedPeriod
          );
        }

        // Refresh dữ liệu từ API để cập nhật UI
        const { data, error } = await getInstallmentPaymentPeriods(installment.id);
        if (!error && data) {
          setPaymentPeriods(data);
        }
        
      } else {
        // Lấy tất cả các kỳ từ calculateCombinedPaymentPeriods
        const allPeriods = calculateCombinedPaymentPeriods();
        
        // Kiểm tra xem có kỳ nào sau đã được thanh toán không
        const laterPeriods = allPeriods.slice(index + 1);
        const anyLaterPeriodPaid = laterPeriods.some(p => p && isPeriodInDatabase(p));
        
        if (anyLaterPeriodPaid) {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: "Không thể bỏ đánh dấu kỳ này vì có kỳ sau đã được thanh toán."
          });
          return;
        }
        
        // Chỉ xóa kỳ trong DB nếu đã tồn tại (không phải kỳ tính toán)
        if (!period.id.startsWith('calculated-')) {
          await deleteInstallmentPaymentPeriod(period.id);
          
          // Refresh dữ liệu từ API để cập nhật UI
          const { data, error } = await getInstallmentPaymentPeriods(installment.id);
          if (!error && data) {
            setPaymentPeriods(data);
          }
        }
      }
      
      // Hiển thị thông báo thành công
      toast({
        title: "Thành công",
        description: checked 
          ? "Đã đánh dấu kỳ này và các kỳ trước là đã thanh toán" 
          : "Đã bỏ đánh dấu thanh toán cho kỳ này",
      });
      
    } catch (error) {
      console.error('Error updating payment status:', error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Có lỗi xảy ra khi cập nhật trạng thái thanh toán. Vui lòng thử lại."
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="sm:max-w-[800px] md:max-w-[900px] max-h-[90vh] overflow-y-auto" 
      >
        <DialogHeader>
          <DialogTitle>Hợp đồng trả góp</DialogTitle>
        </DialogHeader>
        
        <div className="mt-2">
          {/* Thông tin khách hàng */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">{installment?.customer?.name || 'Khách hàng'}</h3>
            <h3 className="font-medium text-red-600">Tổng lãi phí: {formatCurrency(totalExpected)}</h3>
          </div>
          
          {/* Tổng hợp chi tiết */}
          <div className="grid grid-cols-2 gap-8 my-4">
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền đưa khách</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(installment?.amount_given || 0)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Tiền trả góp</td>
                    <td className="py-1 px-2 text-right border">
                      {formatCurrency(installmentAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Vay từ ngày</td>
                    <td className="py-1 px-2 text-right border">{formatDate(installment?.start_date)} → {installment?.start_date && installment?.duration
                         ? formatDate(new Date(new Date(installment.start_date).getTime() + (installment.duration - 1) * 24 * 60 * 60 * 1000).toISOString())
                         : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Đã thanh toán</td>
                    <td className="py-1 px-2 text-right border">{formatCurrency(totalPaid)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">{remainingAmount > 0 ? 'Tiền thừa' : 'Nợ cũ'}</td>
                    <td className={`py-1 px-2 text-right border ${remainingAmount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(remainingAmount))}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 border font-bold">Trạng thái</td>
                    <td className="py-1 px-2 text-right border">{installment?.status || 'Đang trả góp'}</td>
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
          {activeTab === 'payment' && (
            <div>
              {loading ? (
                <div className="text-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Đang tải dữ liệu...</p>
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  <p>{error}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">STT</th>
                        <th className="px-2 py-2 text-left text-sm font-medium text-gray-500 border">Ngày (Từ → Đến)</th>
                        <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border">Ngày giao dịch</th>
                        <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền lãi phí</th>
                        <th className="px-2 py-2 text-right text-sm font-medium text-gray-500 border">Tiền khách trả</th>
                        <th className="px-2 py-2 text-center text-sm font-medium text-gray-500 border w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {calculateCombinedPaymentPeriods().map((period, index) => {
                        // Tính toán số ngày của kỳ
                        let periodDays = installment.payment_period || 30;
                        if (index === calculateCombinedPaymentPeriods().length - 1) {
                          // Last period - may be shorter
                          const totalDays = installment.duration || 0;
                          const previousDays = index * periodDays;
                          periodDays = Math.max(1, totalDays - previousDays);
                        }
                        
                        const actualAmount = period.expectedAmount || 0;
                        const isPaid = isPeriodInDatabase(period);
                        const isEditing = selectedPeriodId === period.id;
                        const isDateEditing = selectedDatePeriodId === period.id;
                        
                        // Calculate date period range
                        const startDate = period.dueDate ? new Date(period.dueDate.split('/').reverse().join('-')) : new Date();
                        const endDate = new Date(startDate);
                        endDate.setDate(endDate.getDate() + (periodDays - 1));
                        const dateRange = `${period.dueDate} → ${format(endDate, 'dd/MM/yyyy')}`;
                        
                        return (
                          <tr key={period.id} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-center border">{period.periodNumber}</td>
                            <td className="px-2 py-2 text-center border">
                              {dateRange}
                            </td>
                            <td className="px-2 py-2 text-center border">
                              {isDateEditing ? (
                                <DatePicker
                                  value={selectedDate}
                                  onChange={(date) => {
                                    setSelectedDate(date);
                                    handleSaveDate(period, date);
                                  }}
                                  className="w-32 text-center mx-auto"
                                />
                              ) : (
                                <span 
                                  className={`${!isPaid ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                                  onClick={!isPaid ? () => handleStartDateEditing(period) : undefined}
                                >
                                  {period.paymentDate || '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right border">{formatCurrency(period.expectedAmount)}</td>
                            <td className="px-2 py-2 text-right border">
                              {isEditing ? (
                                <div className="flex items-center justify-end space-x-1">
                                  <input
                                    type="text"
                                    className="border rounded w-24 px-1 py-0.5 text-right text-sm"
                                    value={formatNumberWithDot(paymentAmount)}
                                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value.replace(/\./g, '')) || 0)}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSavePayment(period);
                                      } else if (e.key === 'Escape') {
                                        setSelectedPeriodId(null);
                                      }
                                    }}
                                  />
                                  <button 
                                    className="text-xs bg-blue-500 text-white px-1 rounded"
                                    onClick={() => handleSavePayment(period)}
                                  >
                                    OK
                                  </button>
                                </div>
                              ) : (
                                <span 
                                  className={`${!isPaid ? "text-blue-500 cursor-pointer" : "text-gray-600"}`}
                                  onClick={!isPaid ? () => handleStartEditing(period) : undefined}
                                >
                                  {formatCurrency(actualAmount)}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center border">
                              <Checkbox 
                                checked={isPaid} 
                                onCheckedChange={(checked) => {
                                  if (period && period.id) {
                                    handleCheckboxChange(period, !!checked, index);
                                  }
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'close' && (
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-medium mb-4">Đóng hợp đồng</h3>
              <div className="text-center py-10 border rounded-md bg-gray-50">
                <p className="text-gray-500">Tính năng đang được phát triển</p>
              </div>
            </div>
          )}
          
          {activeTab === 'documents' && (
            <div className="p-4 border rounded-md">
              <SectionHeader
                icon={<Icon name="document" />}
                title="Chứng từ"
                color="blue"
              />
              
              <div className="flex flex-wrap gap-4 mb-6">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                  <Icon name="upload" size={16} />
                  Upload Ảnh
                </Button>
                
                <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                  <Icon name="document" size={16} />
                  In Chứng Từ
                </Button>
              </div>
              
              {/* Document upload area */}
              <div className="mb-6">
                <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center">
                  <Icon name="upload" size={40} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-600 mb-2">Kéo thả hình ảnh vào đây hoặc</p>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
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
          
          {activeTab === 'history' && (
            <div className="p-4 border rounded-md">
              <h3 className="text-lg font-medium mb-4">Lịch sử giao dịch</h3>
              
              {/* Ghi chú */}
              <div className="mb-6">
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  <h3 className="text-lg font-medium">Ghi Chú</h3>
                </div>
                <div>
                  <textarea 
                    className="w-full border rounded-md p-3 min-h-[100px] text-sm"
                    placeholder="Nhập ghi chú..."
                    value={installment?.notes || ''}
                    readOnly
                  ></textarea>
                </div>
              </div>
              
              {/* Lịch sử thao tác */}
              <div>
                <div className="flex items-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                  <h3 className="text-lg font-medium">Lịch sử thao tác</h3>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16 text-center">STT</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Ngày</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Giao dịch viên</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi nợ</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700 text-right">Số tiền ghi có</th>
                        <th scope="col" className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nội dung</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-700 text-center">1</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{format(new Date(), 'dd-MM-yyyy HH:mm:ss')}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">Admin</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right text-red-600">
                          {formatCurrency(installment?.amount_given || 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">0</td>
                        <td className="px-4 py-3 text-sm text-gray-700">Cho vay trả góp</td>
                      </tr>
                      {paymentPeriods
                        .filter(p => isPeriodInDatabase(p))
                        .map((period, index) => (
                          <tr key={period.id}>
                            <td className="px-4 py-3 text-sm text-gray-700 text-center">{index + 2}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{period.paymentDate || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">Admin</td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right">0</td>
                            <td className="px-4 py-3 text-sm text-gray-700 text-right text-green-600">
                              {formatCurrency(period.actualAmount || 0)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">Thanh toán kỳ {period.periodNumber}</td>
                          </tr>
                        ))}
                      <tr className="bg-amber-50">
                        <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Tổng Tiền</td>
                        <td className="px-4 py-2 text-sm font-medium text-right text-red-600">
                          {formatCurrency(installment?.amount_given || 0)}
                        </td>
                        <td className="px-4 py-2 text-sm font-medium text-right text-blue-600">
                          {formatCurrency(totalPaid)}
                        </td>
                        <td></td>
                      </tr>
                      <tr className="bg-amber-100">
                        <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Chênh lệch</td>
                        <td colSpan={2} className="px-4 py-2 text-sm font-medium text-right text-red-600">
                          {formatCurrency(installment?.amount_given || 0 - totalPaid)}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'bad-debt' && (
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