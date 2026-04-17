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
import { DatePicker } from '@/components/ui/date-picker';
// Không cần import CustomDateInput
// Using regular input radio buttons instead of RadioGroup component
import { createCredit } from '@/lib/credit';
import { getCustomers, createCustomer } from '@/lib/customer';
import { Customer } from '@/models/customer';
import { CreateCreditParams, InterestType, CreditStatus } from '@/models/credit';
import { getStoreFinancialData } from '@/lib/store';
import { AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { MoneyInput } from '@/components/ui/money-input';
import { getDisplayLabelByBuild } from '@/utils/nav-display-labels';

interface CreditCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (creditId: string) => void;
}

export function CreditCreateModal({
  isOpen,
  onClose,
  onSuccess
}: CreditCreateModalProps) {
  // Get current store from context
  const { currentStore } = useStore();
  
  // State for form values
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
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
  const [advancePayment, setAdvancePayment] = useState(false);
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  
  // Add state for customer search
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Quick buttons for loan amount
  const loanAmountPresets = [-5, +5, 10, 20, 30, 40, 50];
  
  // Thêm state cho validate quỹ
  const [fundStatus, setFundStatus] = useState<any>(null);
  const [isFundLoading, setIsFundLoading] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  
  // Additional state for contract code generation
  const [autoGenerateCode, setAutoGenerateCode] = useState<boolean>(true);
  
  // State for interest rate validation warning
  const [interestRateWarning, setInterestRateWarning] = useState<string | null>(null);
  
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
  
  // Load customers for dropdown
  useEffect(() => {
    if (!isOpen) return;
    
    async function loadCustomers() {
      setIsLoadingCustomers(true);
      try {
        const { data, error } = await getCustomers(
          1, 
          1000, 
          '', // search query
          currentStore?.id || '', // filter by store_id from context
          '' // status filter
        );
        if (error) throw error;
        setCustomers(data || []);
      } catch (err) {
        console.error('Error loading customers:', err);
      } finally {
        setIsLoadingCustomers(false);
      }
    }
    
    loadCustomers();
  }, [isOpen, currentStore]);
  
  // Handle customer selection change
  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const selected = customers.find(c => c.id === customerId);
    if (selected) {
      setCustomerName(selected.name);
      setCustomerSearchQuery(selected.name);
      setIdNumber(selected.id_number || '');
      setPhone(selected.phone || '');
      setAddress(selected.address || '');
      setShowCustomerDropdown(false);
    }
  };

  // Handle customer search input change
  const handleCustomerSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setCustomerSearchQuery(query);
    setCustomerName(query);
    
    if (query.trim() === '') {
      setFilteredCustomers([]);
      setShowCustomerDropdown(false);
      setSelectedCustomerId('');
    } else {
      const filtered = customers.filter(customer =>
        customer.name.toLowerCase().includes(query.toLowerCase()) ||
        (customer.phone && customer.phone.includes(query)) ||
        (customer.id_number && customer.id_number.includes(query))
      );
      setFilteredCustomers(filtered);
      setShowCustomerDropdown(filtered.length > 0);
    }
  };
  
  // Handle interest type change
  const handleInterestTypeChange = (value: string) => {
    setInterestType(value);
    
    // Set default notation and update interest period based on interest type
    switch(value) {
      case 'daily':
        setInterestNotation('k_per_million');
        // Default daily period to 10 days
        setInterestPeriod('10');
        
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
        // Set to 30 days (fixed month period)
        setInterestPeriod('1');
        
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
        // Set to 7 days (1 week)
        setInterestPeriod('1');
        
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
        setInterestPeriod('10');
    }
    
    // Validate interest rate with new type
    validateInterestRate(interestValue, value);
  };
  
  // Quick loan amount adjustment
  const adjustLoanAmount = (amount: number) => {
    const newAmount = parseInt(loanAmount || '0') + amount;
    const newAmountStr = newAmount > 0 ? newAmount.toString() : '0';
    setLoanAmount(newAmountStr);
    setFormattedLoanAmount(formatNumber(newAmountStr));
  };
  
  // Load fund status for the current store
  useEffect(() => {
    if (!isOpen || !currentStore?.id) return;
    
    async function loadFundStatus() {
      setIsFundLoading(true);
      try {
        const storeFinancialData = await getStoreFinancialData(currentStore?.id || '');
        setFundStatus(storeFinancialData);
      } catch (err) {
        console.error('Error loading fund status:', err);
        setFundError('Không thể tải thông tin quỹ tiền mặt. Vui lòng thử lại sau.');
      } finally {
        setIsFundLoading(false);
      }
    }
    
    loadFundStatus();
  }, [isOpen, currentStore?.id]);
  
  // Auto-generate contract code when modal opens
  useEffect(() => {
    if (isOpen && autoGenerateCode) {
      // Generate a numerical code: current timestamp + random 3 digits
      const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
      const randomDigits = Math.floor(Math.random() * 900 + 100); // Random 3 digits (100-999)
      const generatedCode = `${timestamp}${randomDigits}`;
      setContractCode(generatedCode);
    }
  }, [isOpen, autoGenerateCode]);
  
  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Ensure we have a store selected
      if (!currentStore?.id) {
        throw new Error('Vui lòng chọn chi nhánh trước khi tạo hợp đồng');
      }
      
      // Validate loan amount against available funds
      const loanAmountValue = parseInt(loanAmount || '0');
      if (!fundStatus || fundStatus.availableFund < loanAmountValue) {
        throw new Error(`Quỹ tiền mặt không đủ. Hiện có ${fundStatus ? Math.floor(fundStatus.availableFund).toLocaleString() : 0} VND.`);
      }
      
      // For new customers, create a customer record first
      let finalCustomerId = selectedCustomerId;
      
      if (customerType === 'new') {
        if (!customerName.trim()) {
          throw new Error('Vui lòng nhập tên khách hàng');
        }
        
        // Create new customer
        const { data: newCustomer, error: customerError } = await createCustomer({
          name: customerName,
          store_id: currentStore.id,
          phone,
          address,
          id_number: idNumber
        });
        
        if (customerError) {
          throw new Error(`Không thể tạo khách hàng mới: ${customerError instanceof Error ? customerError.message : JSON.stringify(customerError)}`);
        }
        
        if (!newCustomer?.id) {
          throw new Error('Không thể tạo khách hàng mới');
        }
        
        // Use the newly created customer's ID
        finalCustomerId = newCustomer.id;
      } else if (!finalCustomerId) {
        throw new Error('Vui lòng chọn khách hàng');
      }
      
      // Map the UI interest type to the backend interest type
      let backendInterestType = InterestType.PERCENTAGE;
      let actualInterestValue = parseFloat(interestValue || '0');
      
      // Convert interest value based on notation
      if (interestType === 'daily') {
        backendInterestType = InterestType.FIXED_AMOUNT;
      } else if (interestType === 'monthly_30' || interestType === 'monthly_custom') {
        backendInterestType = InterestType.PERCENTAGE;
        // Keep percentage as is
      } else if (interestType === 'weekly_percent') {
        backendInterestType = InterestType.PERCENTAGE;
        // Keep percentage as is
      } else if (interestType === 'weekly_k') {
        backendInterestType = InterestType.FIXED_AMOUNT;
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
      
      // Prepare credit data
      const creditData: CreateCreditParams = {
        customer_id: finalCustomerId,
        collateral,
        contract_code: contractCode,
        loan_amount: loanAmountValue,
        interest_type: backendInterestType,
        interest_value: actualInterestValue,
        interest_ui_type: interestType, // Store the UI interest type
        interest_notation: interestNotation, // Store the notation format
        loan_period: convertLoanPeriodToDays(loanPeriod, interestType),
        interest_period: convertInterestPeriodForStorage(interestPeriod, interestType),
        loan_date: new Date(loanDate),
        status: CreditStatus.ON_TIME,
        notes: notes,
        store_id: currentStore.id, // Use store ID from context
      };
      
      // Validate interest value
      if (!interestValue || interestValue === '0' || interestValue.trim() === '') {
        setIsLoading(false);
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: 'Vui lòng nhập lãi phí khác 0',
        });
        return;
      }
      
      // Validate loan period
      if (!loanPeriod || loanPeriod === '0' || loanPeriod.trim() === '') {
        setIsLoading(false);
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: 'Vui lòng nhập số ngày/tuần/tháng vay khác 0',
        });
        return;
      }
      
      // Validate interest period
      if (!interestPeriod || interestPeriod === '0' || interestPeriod.trim() === '') {
        setIsLoading(false);
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: 'Vui lòng nhập kỳ lãi khác 0',
        });
        return;
      }
      
      // Call API to create credit
      const { data, error } = await createCredit(creditData);
      
      if (error) throw error;
      
      // Success - close modal and notify parent
      if (onSuccess && data?.id) {
        onSuccess(data.id);
      }
      onClose();
    } catch (err) {
      console.error('Error creating credit:', err);
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi tạo hợp đồng. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[400px] sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Hợp đồng vay tiền</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Customer selection */}
          <div className="flex justify-center mb-4">
            <div className="flex space-x-8">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="new-customer"
                  name="customerType"
                  value="new"
                  checked={customerType === 'new'}
                  onChange={() => setCustomerType('new')}
                  className="mr-2"
                />
                <Label htmlFor="new-customer">Khách hàng mới</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="existing-customer"
                  name="customerType"
                  value="existing"
                  checked={customerType === 'existing'}
                  onChange={() => setCustomerType('existing')}
                  className="mr-2"
                />
                <Label htmlFor="existing-customer">Khách hàng đã có trong hệ thống</Label>
              </div>
            </div>
          </div>
          
          {/* Customer information */}
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="customerName" className="text-left sm:text-right font-medium">
              Tên khách hàng <span className="text-red-500">*</span>
            </Label>
            {customerType === 'new' ? (
              <Input 
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            ) : (
              <div className="relative">
                <Input 
                  id="customerName"
                  value={customerSearchQuery}
                  onChange={handleCustomerSearchChange}
                  onFocus={() => {
                    if (filteredCustomers.length > 0) {
                      setShowCustomerDropdown(true);
                    }
                  }}
                  placeholder="Nhập tên, SĐT hoặc CCCD để tìm khách hàng"
                  required
                />
                {showCustomerDropdown && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                    {filteredCustomers.map(customer => (
                      <div
                        key={customer.id}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
                        onClick={() => handleCustomerChange(customer.id)}
                      >
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-sm text-gray-500">
                          {customer.phone && `SĐT: ${customer.phone}`}
                          {customer.phone && customer.id_number && ' • '}
                          {customer.id_number && `CCCD: ${customer.id_number}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="contractCode" className="text-left sm:text-right font-medium">Mã HĐ</Label>
            <div className="flex items-center gap-2">
              <Input 
                id="contractCode"
                value={contractCode}
                onChange={(e) => {
                  setContractCode(e.target.value);
                  setAutoGenerateCode(false);
                }}
                placeholder="Mã hợp đồng"
              />
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  const timestamp = Date.now().toString().slice(-6);
                  const randomDigits = Math.floor(Math.random() * 900 + 100);
                  const generatedCode = `${timestamp}${randomDigits}`;
                  setContractCode(generatedCode);
                }}
                className="px-2"
              >
                Tạo mã
              </Button>
            </div>
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="idNumber" className="text-left sm:text-right font-medium">Số CCCD/Hộ chiếu</Label>
            <Input 
              id="idNumber"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="phone" className="text-left sm:text-right font-medium">SĐT</Label>
            <Input 
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
            <Label htmlFor="address" className="text-left sm:text-right font-medium sm:mt-2">Địa chỉ</Label>
            <Textarea 
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
            <Label htmlFor="collateral" className="text-left sm:text-right font-medium sm:mt-2">{getDisplayLabelByBuild('collateral_for_pawn')}</Label>
            <Textarea 
              id="collateral"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="loanAmount" className="text-left sm:text-right font-medium">
              Tổng số tiền vay <span className="text-red-500">*</span>
            </Label>
            <div>
              <MoneyInput 
                id="loanAmount"
                value={loanAmount}
                onChange={handleLoanAmountChange}
                onFocus={e => {
                  if (!loanAmount || loanAmount === "0") e.target.select();
                }}
                required
                placeholder="0"
              />
              {fundError && (
                <div className="text-sm text-red-500 mt-1">{fundError}</div>
              )}
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 mt-2">
                {loanAmountPresets.map(amount => (
                  <Button 
                    key={amount}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => adjustLoanAmount(amount * 1000000)}
                    className="px-2 py-1 h-auto text-xs sm:text-sm"
                  >
                    {amount > 0 ? '+' : ''}{amount}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label className="text-left sm:text-right font-medium">Hình thức lãi</Label>
            <select 
              className="border rounded-md p-2 w-full"
              value={interestType}
              onChange={(e) => handleInterestTypeChange(e.target.value)}
            >
              <option value="daily">Lãi phí ngày</option>
              <option value="monthly_30">Lãi phí tháng (%) (30 ngày)</option>
              <option value="monthly_custom">Lãi phí tháng (%) (Định kỳ)</option>
              <option value="weekly_percent">Lãi phí tuần (%)</option>
              <option value="weekly_k">Lãi phí tuần (k)</option>
            </select>
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="interestValue" className="text-left sm:text-right font-medium">
              Lãi phí <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:space-x-4">
              <Input 
                id="interestValue"
                type="number"
                value={interestValue}
                onChange={(e) => {
                  setInterestValue(e.target.value);
                  validateInterestRate(e.target.value, interestType);
                }}
                required
                className="w-full sm:w-32"
                placeholder="0"
                min={0}
                step="any"
              />
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-4 sm:items-center">
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
                      />
                      <label htmlFor="interestDaily1" className="text-xs sm:text-sm">k/1 triệu</label>
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
                      />
                      <label htmlFor="interestDaily2" className="text-xs sm:text-sm">k/1 ngày</label>
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
                      />
                      <label htmlFor="interestMonthly1" className="text-xs sm:text-sm">%/1 tháng</label>
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
                      />
                      <label htmlFor="interestWeeklyPercent1" className="text-xs sm:text-sm break-words">% /1 tuần</label>
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
                        checked={interestNotation === 'k_per_week'}
                        onChange={() => {
                          setInterestNotation('k_per_week');
                          validateInterestRate(interestValue, interestType);
                        }}
                        className="mr-2"
                      />
                      <label htmlFor="interestWeeklyK1" className="text-xs sm:text-sm break-words">k/1 tuần</label>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {interestRateWarning && (
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <div className="hidden sm:block"></div>
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm" role="alert">
                <span className="flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="break-words">{interestRateWarning}</span>
                </span>
              </div>
            </div>
          )}
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="loanPeriod" className="text-left sm:text-right font-medium">
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
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="interestPeriod" className="text-left sm:text-right font-medium">
              {interestType.startsWith('weekly') ? 'Kỳ lãi (tuần)' : 
               interestType.startsWith('monthly') ? 'Kỳ lãi (tháng)' : 
               'Kỳ lãi (ngày)'} <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:space-x-2">
              <Input 
                id="interestPeriod"
                type="number"
                value={interestPeriod}
                onChange={(e) => setInterestPeriod(e.target.value)}
                required
                className="w-full sm:w-32"
                placeholder="0"
                min={0}
              />
              <div className="text-xs sm:text-sm text-gray-600 break-words">
                {(interestType === 'daily') && 
                  'VD: 10 ngày thì nhập 10'}
                {(interestType === 'monthly_30' || interestType === 'monthly_custom') && 
                  'VD: 1 tháng thì nhập 1'}
                {(interestType === 'weekly_percent' || interestType === 'weekly_k') && 
                  'VD: 1 tuần thì nhập 1'}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="loanDate" className="text-left sm:text-right font-medium">
              Ngày vay <span className="text-red-500">*</span>
            </Label>
            <DatePicker
              id="loanDate"
              value={loanDate}
              onChange={setLoanDate}
              required
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
            <Label htmlFor="notes" className="text-left sm:text-right font-medium sm:mt-2">Ghi chú</Label>
            <Textarea 
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <div className="hidden sm:block"></div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="advancePayment" 
                checked={advancePayment}
                onChange={(e) => setAdvancePayment(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="advancePayment" className="text-sm sm:text-base">Thu lãi trước</label>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
              <span className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                {error}
              </span>
            </div>
          )}
          
          <div className="text-center text-red-500 text-xs sm:text-sm mt-2 px-2">
            *Chú ý : Khách hàng phải đảm bảo lãi suất và chi phí khi cho vay tuân thủ quy định pháp luật.
          </div>
          
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-6">
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto px-6"
              disabled={isLoading}
            >
              {isLoading ? 'Đang xử lý...' : 'Thêm mới'}
            </Button>
            <Button 
              type="button" 
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 w-full sm:w-auto px-6"
              onClick={onClose}
              disabled={isLoading}
            >
              Thoát
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
