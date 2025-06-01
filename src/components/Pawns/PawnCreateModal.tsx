'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
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
import { createPawn } from '@/lib/pawn';
import { getCustomers, createCustomer } from '@/lib/customer';
import { getCollateralsByStore } from '@/lib/collateral';
import { Customer } from '@/models/customer';
import { Collateral } from '@/models/collateral';
import { CreatePawnParams, InterestType, PawnStatus } from '@/models/pawn';
import { getStoreFinancialData } from '@/lib/store';
import { AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface PawnCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (pawnId: string) => void;
} 

export function PawnCreateModal({
  isOpen,
  onClose,
  onSuccess
}: PawnCreateModalProps) {
  // Get current store from context
  const { currentStore } = useStore();
  
  // State for form values
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [collateralId, setCollateralId] = useState('');
  const [collateralDetail, setCollateralDetail] = useState('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [formattedLoanAmount, setFormattedLoanAmount] = useState<string>('');
  const [interestType, setInterestType] = useState<string>('daily');
  const [interestNotation, setInterestNotation] = useState<string>('k_per_million');
  const [interestValue, setInterestValue] = useState<string>('');
  const [interestPeriod, setInterestPeriod] = useState<string>('30');
  const [loanDate, setLoanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [advancePayment, setAdvancePayment] = useState(false);
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  
  // State for collaterals dropdown
  const [collaterals, setCollaterals] = useState<Collateral[]>([]);
  const [selectedCollateral, setSelectedCollateral] = useState<Collateral | null>(null);
  const [isLoadingCollaterals, setIsLoadingCollaterals] = useState(true);
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Quick buttons for loan amount
  const loanAmountPresets = [-5, +5, 10, 20, 30, 40, 50];
  
  // State for fund validation
  const [fundStatus, setFundStatus] = useState<any>(null);
  const [isFundLoading, setIsFundLoading] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  
  // State for contract code generation
  const [autoGenerateCode, setAutoGenerateCode] = useState<boolean>(true);
  
  // State for interest rate validation warning
  const [interestRateWarning, setInterestRateWarning] = useState<string | null>(null);
  
  // Function to validate interest rate
  const validateInterestRate = (value: string, type: string, notation: string) => {
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
    const rawValue = e.target.value.replace(/\./g, '');
    setLoanAmount(rawValue);
    setFormattedLoanAmount(formatNumber(rawValue));
  };
  
  // Adjust loan amount with quick buttons
  const adjustLoanAmount = (adjustment: number) => {
    const currentAmount = parseInt(loanAmount || '0');
    const newAmount = Math.max(0, currentAmount + adjustment);
    setLoanAmount(newAmount.toString());
    setFormattedLoanAmount(formatNumber(newAmount));
  };
  
  // Handle interest type change
  const handleInterestTypeChange = (type: string) => {
    setInterestType(type);
    // Reset interest notation based on type
    if (type === 'daily' || type === 'weekly_k') {
      setInterestNotation('k_per_million');
    } else {
      setInterestNotation('percent_per_month');
    }
    
    // Validate interest rate with new type
    validateInterestRate(interestValue, type, interestNotation);
  };
  
  // Load customers for dropdown
  useEffect(() => {
    if (!isOpen) return;
    
    async function loadCustomers() {
      setIsLoadingCustomers(true);
      try {
        const { data, error } = await getCustomers(1, 1000);
        if (error) throw error;
        setCustomers(data || []);
      } catch (err) {
        console.error('Error loading customers:', err);
      } finally {
        setIsLoadingCustomers(false);
      }
    }
    
    loadCustomers();
  }, [isOpen]);
  
  // Load collaterals for dropdown
  useEffect(() => {
    if (!isOpen || !currentStore?.id) return;
    
    async function loadCollaterals() {
      setIsLoadingCollaterals(true);
      try {
        const { data, error } = await getCollateralsByStore(currentStore!.id);
        if (error) throw error;
        setCollaterals(data || []);
      } catch (err) {
        console.error('Error loading collaterals:', err);
      } finally {
        setIsLoadingCollaterals(false);
      }
    }
    
    loadCollaterals();
  }, [isOpen, currentStore?.id]);
  
  // Handle customer selection change
  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const selected = customers.find(c => c.id === customerId);
    if (selected) {
      setCustomerName(selected.name);
      setIdNumber(selected.id_number || '');
      setPhone(selected.phone || '');
      setAddress(selected.address || '');
    }
  };
  
  // Handle collateral selection change
  const handleCollateralChange = (collateralId: string) => {
    setCollateralId(collateralId);
    const selected = collaterals.find(c => c.id === collateralId);
    if (selected) {
      setSelectedCollateral(selected);
      
      // Optionally pre-fill loan amount based on collateral default value
      if (selected.default_amount) {
        const defaultAmount = selected.default_amount.toString();
        setLoanAmount(defaultAmount);
        setFormattedLoanAmount(formatNumber(defaultAmount));
      }
    } else {
      setSelectedCollateral(null);
    }
  };
  
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
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      if (!currentStore?.id) {
        throw new Error('Không thể xác định cửa hàng hiện tại');
      }
      
      // Validate required fields
      if (!loanAmount) {
        throw new Error('Vui lòng nhập số tiền vay');
      }
      
      if (!collateralId) {
        throw new Error('Vui lòng chọn tài sản thế chấp');
      }
      
      if (!interestValue) {
        throw new Error('Vui lòng nhập lãi suất');
      }
      
      if (!interestPeriod) {
        throw new Error('Vui lòng nhập kỳ lãi phí');
      }
      
      // Basic validation
      const loanAmountValue = parseInt(loanAmount);
      if (isNaN(loanAmountValue) || loanAmountValue <= 0) {
        throw new Error('Số tiền vay phải lớn hơn 0');
      }
      
      const interestPeriodValue = parseInt(interestPeriod);
      if (isNaN(interestPeriodValue) || interestPeriodValue <= 0) {
        throw new Error('Kỳ lãi phí phải lớn hơn 0');
      }
      
      // Always check store fund - this is critical for cash flow management
      const fundData = await getStoreFinancialData(currentStore!.id);
      
      if (!fundData) {
        throw new Error('Không thể kiểm tra quỹ tiền mặt của cửa hàng');
      }
      
      if (fundData.availableFund < loanAmountValue) {
        setFundError(`Số tiền vay (${formatNumber(loanAmountValue)}đ) lớn hơn quỹ tiền mặt hiện có (${formatNumber(fundData.availableFund)}đ)`);
        throw new Error('Số tiền vay vượt quá quỹ tiền mặt hiện có');
      }
      
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
      
      // Prepare pawn data
      const pawnData: CreatePawnParams = {
        customer_id: finalCustomerId,
        contract_code: contractCode,
        id_number: idNumber,
        phone,
        address,
        collateral_id: collateralId,
        collateral_detail: collateralDetail,
        loan_amount: loanAmountValue,
        interest_type: backendInterestType,
        interest_value: actualInterestValue,
        interest_ui_type: interestType, // Store the UI interest type
        interest_notation: interestNotation, // Store the notation format
        loan_period: convertLoanPeriodToDays(interestPeriod, interestType),
        interest_period: convertInterestPeriodForStorage(interestPeriod, interestType),
        loan_date: new Date(loanDate),
        status: PawnStatus.ON_TIME,
        notes: notes,
        store_id: currentStore.id, // Use store ID from context
      };
      
      // Create pawn
      const { data, error: createError } = await createPawn(pawnData);
      
      if (createError) {
        throw new Error(`Không thể tạo hợp đồng cầm đồ: ${createError instanceof Error ? createError.message : JSON.stringify(createError)}`);
      }
      
      if (!data) {
        throw new Error('Không thể tạo hợp đồng cầm đồ');
      }
      
      // Note: Cash fund will be automatically updated by database trigger
      // No need to manually call updateStoreCashFundOnly here
      
      // Show success message
      toast({
        title: 'Thành công',
        description: 'Hợp đồng cầm đồ đã được tạo thành công',
        variant: 'default',
      });
      
      // Call onSuccess callback with new pawn ID
      if (onSuccess) {
        onSuccess(data.id);
      }
      
      // Close modal
      onClose();
      
    } catch (err) {
      console.error('Error creating pawn:', err);
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi tạo hợp đồng cầm đồ');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Hợp đồng cầm đồ</DialogTitle>
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
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="customerName" className="text-right">
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
              <select 
                className="border rounded-md p-2 w-full"
                value={selectedCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                required
              >
                <option value="">Chọn khách hàng</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="contractCode" className="text-right">Mã HĐ</Label>
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
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="idNumber" className="text-right">Số CCCD/CMT</Label>
            <Input 
              id="idNumber"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="phone" className="text-right">Số điện thoại</Label>
            <Input 
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
            <Label htmlFor="address" className="text-right mt-2">Địa chỉ</Label>
            <Textarea 
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="collateralId" className="text-right">
              Tài sản thế chấp <span className="text-red-500">*</span>
            </Label>
            <select 
              className="border rounded-md p-2 w-full"
              value={collateralId}
              onChange={(e) => handleCollateralChange(e.target.value)}
              required
            >
              <option value="">Chọn tài sản</option>
              {collaterals.map(collateral => (
                <option key={collateral.id} value={collateral.id}>
                  {collateral.name} ({collateral.code})
                </option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
            <Label htmlFor="collateralDetail" className="text-right mt-2">Chi tiết tài sản</Label>
            <Textarea 
              id="collateralDetail"
              value={collateralDetail}
              onChange={(e) => setCollateralDetail(e.target.value)}
              rows={3}
              placeholder="Biển số, màu sắc, số khung, số máy, đặc điểm nhận dạng..."
            />
          </div>
          
          {selectedCollateral && (
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
              <div className="text-right text-sm text-gray-500">Thông tin tài sản:</div>
              <div className="text-sm bg-gray-50 p-2 rounded">
                <div><span className="font-medium">Loại:</span> {selectedCollateral.category}</div>
                <div><span className="font-medium">Mã:</span> {selectedCollateral.code}</div>
                <div><span className="font-medium">Giá trị mặc định:</span> {formatNumber(selectedCollateral.default_amount || 0)}đ</div>
                {selectedCollateral.attr_01 && (
                  <div><span className="font-medium">{selectedCollateral.attr_01}:</span> {selectedCollateral.attr_01}</div>
                )}
                {selectedCollateral.attr_02 && (
                  <div><span className="font-medium">{selectedCollateral.attr_02}:</span> {selectedCollateral.attr_02}</div>
                )}
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="loanAmount" className="text-right">
              Tổng số tiền vay <span className="text-red-500">*</span>
            </Label>
            <div>
              <Input 
                id="loanAmount"
                type="text"
                value={formattedLoanAmount}
                onChange={handleLoanAmountChange}
                required
                inputMode="numeric"
                placeholder="0"
              />
              {fundError && (
                <div className="text-sm text-red-500 mt-1">{fundError}</div>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {loanAmountPresets.map(amount => (
                  <Button 
                    key={amount}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => adjustLoanAmount(amount * 1000000)}
                    className="px-2 py-1 h-auto"
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
              Lãi suất <span className="text-red-500">*</span>
            </Label>
            <div>
              <div className="flex gap-2 items-center">
                <Input 
                  id="interestValue"
                  type="text"
                  value={interestValue}
                  onChange={(e) => {
                    setInterestValue(e.target.value);
                    validateInterestRate(e.target.value, interestType, interestNotation);
                  }}
                  required
                  className="w-24"
                  placeholder="0"
                />
                
                {interestType === 'daily' && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="k_per_million" 
                        name="interestNotation" 
                        value="k_per_million"
                        checked={interestNotation === 'k_per_million'}
                        onChange={() => {
                          setInterestNotation('k_per_million');
                          validateInterestRate(interestValue, interestType, 'k_per_million');
                        }}
                        className="mr-1"
                      />
                      <label htmlFor="k_per_million">k/1 triệu</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="k_per_day" 
                        name="interestNotation" 
                        value="k_per_day"
                        checked={interestNotation === 'k_per_day'}
                        onChange={() => {
                          setInterestNotation('k_per_day');
                          validateInterestRate(interestValue, interestType, 'k_per_day');
                        }}
                        className="mr-1"
                      />
                      <label htmlFor="k_per_day">k/ngày</label>
                    </div>
                  </div>
                )}
                
                {interestType === 'weekly_k' && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="k_per_million_weekly" 
                        name="interestNotation" 
                        value="k_per_million"
                        checked={interestNotation === 'k_per_million'}
                        onChange={() => {
                          setInterestNotation('k_per_million');
                          validateInterestRate(interestValue, interestType, 'k_per_million');
                        }}
                        className="mr-1"
                      />
                      <label htmlFor="k_per_million_weekly">k/1 triệu</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="k_per_week" 
                        name="interestNotation" 
                        value="k_per_week"
                        checked={interestNotation === 'k_per_week'}
                        onChange={() => {
                          setInterestNotation('k_per_week');
                          validateInterestRate(interestValue, interestType, 'k_per_week');
                        }}
                        className="mr-1"
                      />
                      <label htmlFor="k_per_week">k/tuần</label>
                    </div>
                  </div>
                )}
                
                {(interestType === 'monthly_30' || interestType === 'monthly_custom') && (
                  <div className="flex items-center gap-1">
                    <span>% / tháng</span>
                  </div>
                )}
                
                {interestType === 'weekly_percent' && (
                  <div className="flex items-center gap-1">
                    <span>% / tuần</span>
                  </div>
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
            <Label htmlFor="interestPeriod" className="text-right">
              Kỳ lãi phí <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input 
                id="interestPeriod"
                type="number"
                value={interestPeriod}
                onChange={(e) => setInterestPeriod(e.target.value)}
                className="w-24"
                min="1"
                placeholder="30"
                required
              />
              <span>
                {interestType === 'daily' && 'ngày (mỗi kỳ lãi)'}
                {interestType === 'monthly_30' && 'tháng (mỗi kỳ lãi)'}
                {interestType === 'monthly_custom' && 'ngày (mỗi kỳ lãi)'}
                {interestType === 'weekly_percent' && 'tuần (mỗi kỳ lãi)'}
                {interestType === 'weekly_k' && 'tuần (mỗi kỳ lãi)'}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="loanDate" className="text-right">Ngày vay</Label>
            <DatePicker
              value={loanDate}
              onChange={(value) => setLoanDate(value)}
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
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <div></div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="advancePayment" 
                checked={advancePayment}
                onChange={(e) => setAdvancePayment(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="advancePayment">Thu lãi trước</label>
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
          
          <div className="text-center text-red-500 text-sm mt-2">
            *Chú ý : Khách hàng phải đảm bảo lãi suất và chi phí khi cho vay (gọi chung là "chi phí vay") tuân thủ quy định pháp luật tại từng thời điểm.
          </div>
          
          <div className="flex justify-center space-x-4 mt-6">
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isLoading}
            >
              {isLoading ? 'Đang xử lý...' : 'Thêm mới'}
            </Button>
            <Button 
              type="button" 
              className="bg-gray-200 hover:bg-gray-300 text-gray-800"
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