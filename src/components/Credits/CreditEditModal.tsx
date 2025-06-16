'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import { format } from 'date-fns';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { getCreditById, hasCreditAnyPayments, updateCredit } from '@/lib/credit';
import { getCustomers } from '@/lib/customer';
import { Customer } from '@/models/customer';
import { UpdateCreditParams, InterestType, CreditStatus, Credit } from '@/models/credit';
import { toast } from '@/components/ui/use-toast';
import { AlertCircle } from 'lucide-react';
import { MoneyInput } from '@/components/ui/money-input';
import { usePermissions } from '@/hooks/usePermissions';
import { DatePicker } from '../ui/date-picker';
interface CreditEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditId: string;
  onSuccess?: (creditId: string) => void;
}

export function CreditEditModal({
  isOpen,
  onClose,
  creditId,
  onSuccess
}: CreditEditModalProps) {
  // Get current store from context
  const { currentStore } = useStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  // State for form values
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [collateral, setCollateral] = useState('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [formattedLoanAmount, setFormattedLoanAmount] = useState<string>('');
  const [interestType, setInterestType] = useState<string>('daily');
  const [interestNotation, setInterestNotation] = useState<string>('k_per_million');  // For tracking the selected radio button option
  const [interestValue, setInterestValue] = useState<string>('');
  const [loanPeriod, setLoanPeriod] = useState<string>('');
  const [interestPeriod, setInterestPeriod] = useState<string>('');
  const [loanDate, setLoanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<CreditStatus>(CreditStatus.ON_TIME);
  const [advancePayment, setAdvancePayment] = useState(false);
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState<Credit | null>(null);
  
  // Quick buttons for loan amount
  const loanAmountPresets = [-5, +5, 10, 20, 30, 40, 50];
  
  // State for interest rate validation warning
  const [interestRateWarning, setInterestRateWarning] = useState<string | null>(null);

  // State to track if credit has payments
  const [hasPayments, setHasPayments] = useState<boolean>(false);
  
  // Function to validate interest rate
  const validateInterestRate = (value: string, type: string) => {
    const numValue = parseFloat(value || '0');
    if (isNaN(numValue) || numValue <= 0) {
      setInterestRateWarning(null);
      return;
    }
    
    let isExceeded = false;
    
    if (type === 'daily') {
      // Lãi ngày > 2.74
      if (numValue > 2.74) {
        isExceeded = true;
      }
    } else if (type === 'monthly_30' || type === 'monthly_custom') {
      // Lãi phí tháng (%) > 8.3
      if (numValue > 8.3) {
        isExceeded = true;
      }
    } else if (type === 'weekly_percent') {
      // Lãi phí tuần (%) > 1.92
      if (numValue > 1.92) {
        isExceeded = true;
      }
    } else if (type === 'weekly_k') {
      // Lãi phí tuần (k) > 19.17
      if (numValue > 19.17) {
        isExceeded = true;
      }
    }
    
    if (isExceeded) {
      setInterestRateWarning('Lãi suất nhập vượt mức cho phép (100%/năm), vi phạm Điều 201 Bộ luật Hình sự. Vui lòng điều chỉnh.');
    } else {
      setInterestRateWarning(null);
    }
  };
  
  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    // Convert to number and back to string to remove non-numeric characters
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    // Format with thousand separators
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  
  // Handle loan amount change
  const handleLoanAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setLoanAmount(rawValue);
    setFormattedLoanAmount(formatNumber(rawValue));
  };
  
  // Handle interest type change
  const handleInterestTypeChange = (value: string) => {
    setInterestType(value);
    
    // Set default notation and update interest period based on interest type
    switch(value) {
      case 'daily':
        setInterestNotation('k_per_million');
        // Để nguyên interest period vì đã đúng đơn vị ngày
        
        // Update loan period to days if coming from a different format
        if (interestType.startsWith('weekly') || interestType.startsWith('monthly')) {
          const currentPeriod = parseInt(loanPeriod || '0');
          // Convert from weeks/months to days
          const newPeriod = interestType.startsWith('weekly') 
            ? currentPeriod * 7  // weeks to days
            : currentPeriod * 30; // months to days
          setLoanPeriod(newPeriod > 0 ? newPeriod.toString() : '');
        }
        break;
        
      case 'monthly_30':
      case 'monthly_custom':
        setInterestNotation('percent_per_month');
        // Cập nhật thành 30 ngày (1 tháng 30 ngày)
        setInterestPeriod('30');
        
        // Update loan period to months if coming from a different format
        if (!interestType.startsWith('monthly')) {
          const currentPeriod = parseInt(loanPeriod || '0');
          // Convert to months (rounded)
          let newPeriod = interestType.startsWith('weekly')
            ? Math.ceil(currentPeriod / 4) // weeks to months (rough approximation)
            : Math.ceil(currentPeriod / 30); // days to months
          // Ensure minimum 1 month
          newPeriod = Math.max(1, newPeriod);
          setLoanPeriod(currentPeriod > 0 ? newPeriod.toString() : '');
        }
        break;
        
      case 'weekly_percent':
      case 'weekly_k':
        setInterestNotation(value === 'weekly_percent' ? 'percent_per_week' : 'k_per_week');
        // Cập nhật thành 7 ngày (1 tuần)
        setInterestPeriod('7');
        
        // Update loan period to weeks if coming from a different format
        if (!interestType.startsWith('weekly')) {
          const currentPeriod = parseInt(loanPeriod || '0');
          // Convert to weeks (rounded)
          let newPeriod = interestType.startsWith('monthly')
            ? currentPeriod * 4 // months to weeks (rough approximation)
            : Math.ceil(currentPeriod / 7); // days to weeks
          // Ensure minimum 1 week
          newPeriod = Math.max(1, newPeriod);
          setLoanPeriod(currentPeriod > 0 ? newPeriod.toString() : '');
        }
        break;
        
      default:
        setInterestNotation('k_per_million');
    }
    
    // Validate interest rate with new type
      validateInterestRate(interestValue, value);
  };
  
  // Load credit data and customers when modal opens
  useEffect(() => {
    if (!isOpen || !creditId) return;
    
    async function loadData() {
      setIsLoadingData(true);
      setError(null);
      
      try {
        // Load credit data
        const { data: creditData, error: creditError } = await getCreditById(creditId);
        
        if (creditError) throw creditError;
        
        if (!creditData) {
          throw new Error('Không tìm thấy hợp đồng');
        }
        
        setCredit(creditData);
        
        // Check if credit has any payments
        const { hasPaidPeriods, error: paymentsError } = await hasCreditAnyPayments(creditId);
        if (paymentsError) {
          console.error('Error checking payments:', paymentsError);
        } else {
          setHasPayments(hasPaidPeriods);
        }

        // Set form values from credit data
        setContractCode(creditData.contract_code || '');
        setIdNumber(creditData.id_number || '');
        setPhone(creditData.phone || '');
        setAddress(creditData.address || '');
        setCollateral(creditData.collateral || '');
        const loanAmountStr = creditData.loan_amount?.toString() || '';
        setLoanAmount(loanAmountStr);
        setFormattedLoanAmount(formatNumber(loanAmountStr));
        // Get interest UI type and notation from the credit data
        // If they're available in the dedicated fields, use those
        // Otherwise, fall back to extracting from notes (for backward compatibility)
        let detectedInterestType = creditData.interest_ui_type || 'daily';
        let detectedNotation = creditData.interest_notation || 'k_per_million';
        
        // For backward compatibility with older records
        if (!creditData.interest_ui_type && creditData.notes) {
          // Check for saved interest mode pattern in notes
          const interestModeMatch = creditData.notes.match(/\[(\w+_\w+)\]/);
          if (interestModeMatch && interestModeMatch[1]) {
            detectedInterestType = interestModeMatch[1];
            
            // Set default notation based on detected interest type
            if (detectedInterestType === 'daily') {
              detectedNotation = 'k_per_million';
            } else if (detectedInterestType === 'monthly_30' || detectedInterestType === 'monthly_custom') {
              detectedNotation = 'percent_per_month';
            } else if (detectedInterestType === 'weekly_percent') {
              detectedNotation = 'percent_per_week';
            } else if (detectedInterestType === 'weekly_k') {
              detectedNotation = 'k_per_week';
            }
          } else if (creditData.interest_type === InterestType.FIXED_AMOUNT) {
            detectedInterestType = 'weekly_k';
            detectedNotation = 'k_per_week';
          }
        }
        setInterestType(detectedInterestType);
        setInterestNotation(detectedNotation);
        setInterestValue(creditData.interest_value?.toString() || '0');
        
        // Convert loan_period from days to the appropriate unit based on interest type
        const periodInDays = creditData.loan_period || 30;
        let periodToDisplay = periodInDays;
        
        if (detectedInterestType.startsWith('weekly')) {
          // Convert days to weeks
          periodToDisplay = Math.round(periodInDays / 7);
          // Ensure at least 1 week
          periodToDisplay = Math.max(1, periodToDisplay);
        } else if (detectedInterestType.startsWith('monthly')) {
          // Convert days to months
          periodToDisplay = Math.round(periodInDays / 30);
          // Ensure at least 1 month
          periodToDisplay = Math.max(1, periodToDisplay);
        }
        
        setLoanPeriod(periodToDisplay.toString());
        
        // Convert interest_period from days to the appropriate unit based on interest type
        const interestPeriodInDays = creditData.interest_period || 10;
        let interestPeriodToDisplay = interestPeriodInDays;
        
        if (detectedInterestType.startsWith('weekly')) {
          // Convert days to weeks
          interestPeriodToDisplay = Math.round(interestPeriodInDays / 7);
          // Ensure at least 1 week
          interestPeriodToDisplay = Math.max(1, interestPeriodToDisplay);
        } else if (detectedInterestType.startsWith('monthly')) {
          // Convert days to months
          interestPeriodToDisplay = Math.round(interestPeriodInDays / 30);
          // Ensure at least 1 month
          interestPeriodToDisplay = Math.max(1, interestPeriodToDisplay);
        }
        
        setInterestPeriod(interestPeriodToDisplay.toString());
        setLoanDate(creditData.loan_date ? format(new Date(creditData.loan_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
        setNotes(creditData.notes || '');
        setStatus(creditData.status as CreditStatus || CreditStatus.ON_TIME);
        setSelectedCustomerId(creditData.customer_id);
        
        // Load customers list filtered by current store
        const { data: customersData, error: customersError } = await getCustomers(
          1, 
          1000, 
          '', // search query
          currentStore?.id || '', // filter by store_id from context
          '' // status filter
        );
        
        if (customersError) throw customersError;
        
        setCustomers(customersData || []);
        
        // Find customer name from customers list
        const customer = customersData?.find(c => c.id === creditData.customer_id);
        if (customer) {
          setCustomerName(customer.name);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
      } finally {
        setIsLoadingData(false);
      }
    }
    
    loadData();
  }, [isOpen, creditId]);
  
  // Quick loan amount adjustment
  const adjustLoanAmount = (amount: number) => {
    const newAmount = parseInt(loanAmount || '0') + amount;
    const newAmountStr = newAmount > 0 ? newAmount.toString() : '0';
    setLoanAmount(newAmountStr);
    setFormattedLoanAmount(formatNumber(newAmountStr));
  };
  
  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Map the UI interest type to the backend interest type
      let backendInterestType = InterestType.PERCENTAGE;
      if (interestType === 'daily') {
        backendInterestType = InterestType.PERCENTAGE;
      } else if (interestType === 'monthly_30' || interestType === 'monthly_custom' || 
                interestType === 'weekly_percent') {
        backendInterestType = InterestType.PERCENTAGE;
      } else if (interestType === 'weekly_k') {
        backendInterestType = InterestType.FIXED_AMOUNT;
      }
      
      // Ensure we have a store selected
      if (!currentStore?.id) {
        throw new Error('Vui lòng chọn chi nhánh trước khi cập nhật hợp đồng');
      }
      
      // Convert loan period to days based on interest type
      const convertLoanPeriodToDays = (period: string, type: string): number => {
        const periodNum = parseInt(period || '0');
        if (type.startsWith('weekly')) {
          return periodNum * 7; // weeks to days
        } else if (type.startsWith('monthly')) {
          return periodNum * 30; // months to days
        }
        return periodNum; // already in days
      };
      
      // Convert interest period based on interest type
      const convertInterestPeriodForStorage = (period: string, type: string): number => {
        const periodNum = parseInt(period || '0');
        // For weekly interest types, if user enters 1, it means 1 week (7 days)
        // For monthly interest types, if user enters 1, it means 1 month (30 days)
        if (type.startsWith('weekly') && periodNum > 0) {
          return periodNum * 7; // weeks to days
        } else if (type.startsWith('monthly') && periodNum > 0) {
          return periodNum * 30; // months to days
        }
        return periodNum; // already in days
      };
      
      // Prepare update data
      const updateData: UpdateCreditParams = {
        customer_id: selectedCustomerId,
        collateral,
        loan_amount: parseInt(loanAmount || '0'),
        interest_type: backendInterestType,
        interest_value: parseFloat(interestValue || '0'),
        interest_ui_type: interestType, // Save the UI interest type
        interest_notation: interestNotation, // Save the notation format
        loan_period: convertLoanPeriodToDays(loanPeriod, interestType),
        interest_period: convertInterestPeriodForStorage(interestPeriod, interestType),
        loan_date: new Date(loanDate),
        notes: notes, // Keep notes clean, don't append the interest type information
        status,
        store_id: currentStore.id, // Use store ID from context
      };
      
      // Validate
      if (!interestValue || interestValue === '0' || interestValue.trim() === '') {
        setIsLoading(false);
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: 'Vui lòng nhập lãi phí khác 0',
        });
        return;
      }
      if (!loanPeriod || loanPeriod === '0' || loanPeriod.trim() === '') {
        setIsLoading(false);
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: 'Vui lòng nhập số ngày/tuần/tháng vay khác 0',
        });
        return;
      }
      if (!interestPeriod || interestPeriod === '0' || interestPeriod.trim() === '') {
        setIsLoading(false);
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: 'Vui lòng nhập kỳ lãi khác 0',
        });
        return;
      }
      
      // Call API to update credit
      const { data, error } = await updateCredit(creditId, updateData);
      
      if (error) throw error;
      
      // Success - close modal and notify parent
      if (onSuccess && data?.id) {
        onSuccess(data.id);
      }
      onClose();
    } catch (err) {
      console.error('Error updating credit:', err);
      setError('Có lỗi xảy ra khi cập nhật hợp đồng. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Chỉnh sửa hợp đồng vay tiền</DialogTitle>
        </DialogHeader>
        
        {isLoadingData ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="ml-2">Đang tải thông tin hợp đồng...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">{error}</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {/* Customer information - read only */}
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="customerName" className="text-right">
                Tên khách hàng
              </Label>
              <select 
                className="border rounded-md p-2 w-full"
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  const customer = customers.find(c => c.id === e.target.value);
                  if (customer) {
                    setCustomerName(customer.name);
                    setIdNumber(customer.id_number || '');
                    setPhone(customer.phone || '');
                    setAddress(customer.address || '');
                  }
                }}
                required
              >
                <option value="">Chọn khách hàng</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="contractCode" className="text-right">Mã HĐ</Label>
              <Input 
                id="contractCode"
                value={contractCode}
                onChange={(e) => setContractCode(e.target.value)}
                placeholder="Mã hợp đồng"
                disabled
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="idNumber" className="text-right">Số CCCD/Hộ chiếu</Label>
              <Input 
                id="idNumber"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                disabled
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="phone" className="text-right">SĐT</Label>
              <Input 
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
              <Label htmlFor="address" className="text-right mt-2">Địa chỉ</Label>
              <Textarea 
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                disabled
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
              <Label htmlFor="collateral" className="text-right mt-2">Tài sản thế chấp</Label>
              <Textarea 
                id="collateral"
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
                rows={3}
                disabled
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="loanAmount" className="text-right">
                Tổng số tiền vay <span className="text-red-500">*</span>
              </Label>
              <div>
                <MoneyInput 
                  id="loanAmount"
                  value={loanAmount}
                  onChange={handleLoanAmountChange}
                  required
                  placeholder="0"
                  disabled={hasPayments}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {loanAmountPresets.map(amount => (
                    <Button 
                      key={amount}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => adjustLoanAmount(amount * 1000000)}
                      className="px-2 py-1 h-auto"
                      disabled={hasPayments}
                    >
                      {amount > 0 ? '+' : ''}{amount}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label className="text-right">Hình thức lãi</Label>
              <select 
                className="border rounded-md p-2 w-full"
                value={interestType}
                onChange={(e) => handleInterestTypeChange(e.target.value)}
                disabled={hasPayments}
              >
                <option value="daily">Lãi phí ngày</option>
                <option value="monthly_30">Lãi phí tháng (%) (30 ngày)</option>
                <option value="monthly_custom">Lãi phí tháng (%) (Định kỳ)</option>
                <option value="weekly_percent">Lãi phí tuần (%)</option>
                <option value="weekly_k">Lãi phí tuần (k)</option>
              </select>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="interestValue" className="text-right">
                Lãi phí <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center space-x-4">
                <Input 
                  id="interestValue"
                  type="number"
                  value={interestValue}
                  onChange={(e) => {
                    setInterestValue(e.target.value);
                    validateInterestRate(e.target.value, interestType);
                  }}
                  required
                  className="w-32"
                  placeholder="0"
                  min={0}
                  disabled={hasPayments}
                />
                <div className="flex flex-wrap gap-4 items-center">
                  {interestType === 'daily' && (
                    <>
                      <div className="flex items-center">
                        <input 
                          type="radio" 
                          id="interestDaily1" 
                          name="interestDaily" 
                          checked={interestNotation === 'k_per_million'}
                          onChange={() => {
                            setInterestNotation('k_per_million');
                            validateInterestRate(interestValue, interestType);
                          }}
                          className="mr-2"
                          disabled={hasPayments}
                        />
                        <label htmlFor="interestDaily1" className="text-sm">k/1 triệu</label>
                      </div>
                      <div className="flex items-center">
                        <input 
                          type="radio" 
                          id="interestDaily2" 
                          name="interestDaily" 
                          checked={interestNotation === 'k_per_day'}
                          onChange={() => {
                            setInterestNotation('k_per_day');
                            validateInterestRate(interestValue, interestType);
                          }}
                          className="mr-2"
                          disabled={hasPayments}
                        />
                        <label htmlFor="interestDaily2" className="text-sm">k/1 ngày</label>
                      </div>
                    </>
                  )}
                  
                  {(interestType === 'monthly_30' || interestType === 'monthly_custom') && (
                    <>
                      <div className="flex items-center">
                        <input 
                          type="radio" 
                          id="interestMonthly1" 
                          name="interestMonthly" 
                          checked={interestNotation === 'percent_per_month'}
                          onChange={() => {
                            setInterestNotation('percent_per_month');
                            validateInterestRate(interestValue, interestType);
                          }}
                          className="mr-2"
                          disabled={hasPayments}
                        />
                        <label htmlFor="interestMonthly1" className="text-sm">%/1 tháng</label>
                      </div>
                    </>
                  )}
                  
                  {interestType === 'weekly_percent' && (
                    <>
                      <div className="flex items-center">
                        <input 
                          type="radio" 
                          id="interestWeeklyPercent1" 
                          name="interestWeeklyPercent" 
                          checked={interestNotation === 'percent_per_week'}
                          onChange={() => {
                            setInterestNotation('percent_per_week');
                            validateInterestRate(interestValue, interestType);
                          }}
                          className="mr-2"
                          disabled={hasPayments}
                        />
                        <label htmlFor="interestWeeklyPercent1" className="text-sm">% /1 tuần (VD : 2% / 1 tuần)</label>
                      </div>
                    </>
                  )}
                  
                  {interestType === 'weekly_k' && (
                    <>
                      <div className="flex items-center">
                        <input 
                          type="radio" 
                          id="interestWeeklyK1" 
                          name="interestWeeklyK" 
                          checked={true}
                          className="mr-2"
                          disabled={hasPayments}
                        />
                        <label htmlFor="interestWeeklyK1" className="text-sm">k/1 tuần (VD: 100k/1 tuần)</label>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {interestRateWarning && (
              <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
                <div></div>
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm" role="alert">
                  <span className="flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {interestRateWarning}
                  </span>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="loanPeriod" className="text-right">
                {interestType.startsWith('weekly') ? 'Số tuần vay' : 
                 interestType.startsWith('monthly') ? 'Số tháng vay' : 
                 'Số ngày vay'} <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="loanPeriod"
                type="number"
                value={loanPeriod}
                onChange={(e) => setLoanPeriod(e.target.value)}
                required
                placeholder="0"
                min={0}
                disabled={hasPayments}
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="interestPeriod" className="text-right">
                {interestType.startsWith('weekly') ? 'Kỳ lãi (tuần)' : 
                 interestType.startsWith('monthly') ? 'Kỳ lãi (tháng)' : 
                 'Kỳ lãi (ngày)'} <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center space-x-2">
                <Input 
                  id="interestPeriod"
                  type="number"
                  value={interestPeriod}
                  onChange={(e) => setInterestPeriod(e.target.value)}
                  required
                  className="w-32"
                  placeholder="0"
                  min={0}
                />
                <div className="text-sm text-gray-600">
                  {(interestType === 'daily') && 
                    '(VD: 10 ngày đóng lãi phí 1 lần thì điền số 10)'}
                  {(interestType === 'monthly_30' || interestType === 'monthly_custom') && 
                    '(VD: 1 tháng đóng lãi phí 1 lần thì điền số 1)'}
                  {(interestType === 'weekly_percent' || interestType === 'weekly_k') && 
                    '(VD: 1 tuần đóng lãi phí 1 lần thì điền số 1)'}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="loanDate" className="text-right">
                Ngày vay <span className="text-red-500">*</span>
              </Label>
              <DatePicker 
                id="loanDate"
                value={loanDate}
                onChange={(date) => setLoanDate(date)}
                required
                disabled={hasPayments || !hasPermission('sua_ngay_vay_tin_chap')}
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
              <Label htmlFor="notes" className="text-right mt-2">Ghi chú</Label>
              <Textarea 
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
            
            {error && (
              <div className="text-red-500 text-center">{error}</div>
            )}
            
            <div className="flex justify-center space-x-4 mt-6">
              <Button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isLoading || status === CreditStatus.CLOSED || status === CreditStatus.DELETED}
              >
                {isLoading ? 'Đang xử lý...' : 'Cập nhật'}
              </Button>
              <Button 
                type="button" 
                className="bg-gray-200 hover:bg-gray-300 text-gray-800"
                onClick={onClose}
                disabled={isLoading}
              >
                Hủy bỏ
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
