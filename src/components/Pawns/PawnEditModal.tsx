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
import { AlertCircle, Loader2 } from 'lucide-react';
import { getPawnById, hasPawnAnyPayments, updatePawn } from '@/lib/pawn';
import { getCustomers } from '@/lib/customer';
import { getCollateralById, getCollateralsByStore } from '@/lib/collateral';
import { Customer } from '@/models/customer';
import { PawnStatus, UpdatePawnParams, Pawn, InterestType, CollateralDetail } from '@/models/pawn';
import { toast } from '@/components/ui/use-toast';
import { MoneyInput } from '@/components/ui/money-input';
import { Collateral } from '@/models/collateral';
import { usePermissions } from '@/hooks/usePermissions';
import { getDisplayLabelByBuild } from '@/utils/nav-display-labels';

interface PawnEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  pawnId: string;
  onSuccess?: () => void;
}

export function PawnEditModal({
  isOpen,
  onClose,
  pawnId,
  onSuccess
}: PawnEditModalProps) {
  // Get current store from context
  const { currentStore } = useStore();
  
  // Get user permissions
  const { hasPermission } = usePermissions();
  
  // State for form values
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [collateralId, setCollateralId] = useState<string>('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [formattedLoanAmount, setFormattedLoanAmount] = useState<string>('');
  const [interestType, setInterestType] = useState<string>('daily');
  const [interestNotation, setInterestNotation] = useState<string>('k_per_million');
  const [interestValue, setInterestValue] = useState<string>('');
  const [interestPeriod, setInterestPeriod] = useState<string>('30');
  const [isAdvancePayment, setIsAdvancePayment] = useState(false);
  const [loanDate, setLoanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<PawnStatus>(PawnStatus.ON_TIME);
  
  // State for collateral details
  const [collateralName, setCollateralName] = useState('');
  const [collateralQuantity, setCollateralQuantity] = useState<string>('');
  const [collateralAttributes, setCollateralAttributes] = useState<Record<string, string>>({});
  const [collaterals, setCollaterals] = useState<Collateral[]>([]);
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  // State for collateral info
  const [selectedCollateral, setSelectedCollateral] = useState<Collateral | null>(null);
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pawn, setPawn] = useState<Pawn | null>(null);
  
  // State for interest rate validation warning
  const [interestRateWarning, setInterestRateWarning] = useState<string | null>(null);

  // State to track if pawn has payments
  const [hasPayments, setHasPayments] = useState<boolean>(false);
  
  // Quick buttons for loan amount
  const loanAmountPresets = [-5, +5, 10, 20, 30, 40, 50];
  
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
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  
  // Handle loan amount change
  const handleLoanAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
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

  // Handle collateral selection change
  const handleCollateralChange = (collateralId: string) => {
    setCollateralId(collateralId);
    const selected = collaterals.find(c => c.id === collateralId);
    if (selected) {
      setSelectedCollateral(selected);

      // Reset collateral attributes when changing collateral type
      setCollateralAttributes({});
      setCollateralQuantity('');

    } else {
      setSelectedCollateral(null);
      setCollateralAttributes({});
      setCollateralQuantity('');
    }
  };

  // Handle collateral attribute change
  const handleCollateralAttributeChange = (attrKey: string, value: string) => {
    setCollateralAttributes(prev => ({
      ...prev,
      [attrKey]: value
    }));
  };
  
  // Load pawn data and customers when modal opens
  useEffect(() => {
    if (!isOpen || !pawnId) return;
    
    async function loadCollaterals() {
      try {
        const { data, error } = await getCollateralsByStore(currentStore!.id);
        if (error) throw error;
        setCollaterals(data || []);
      } catch (err) {
        console.error('Error loading collaterals:', err);
      }
    }
    
    loadCollaterals();
    
    async function loadData() {
      setIsLoadingData(true);
      setError(null);
      
      try {
        // Load pawn data
        const { data: pawnData, error: pawnError } = await getPawnById(pawnId);
        
        if (pawnError) throw pawnError;
        
        if (!pawnData) {
          throw new Error('Không tìm thấy hợp đồng cầm đồ');
        }
        
        setPawn(pawnData);
        
        // Set form values from pawn data
        setContractCode(pawnData.contract_code || '');
        setIdNumber(pawnData.id_number || '');
        setPhone(pawnData.phone || '');
        setAddress(pawnData.address || '');
        setCollateralId(pawnData.collateral_id || '');
        setInterestType(pawnData.interest_ui_type || 'daily');
        setInterestNotation(pawnData.interest_notation || 'k_per_million');
        
        const loanAmountStr = pawnData.loan_amount?.toString() || '';
        setLoanAmount(loanAmountStr);
        setFormattedLoanAmount(formatNumber(loanAmountStr));
        setInterestValue(pawnData.interest_value?.toString() || '');
        setInterestPeriod(pawnData.interest_period?.toString() || '30');
        setIsAdvancePayment(pawnData.is_advance_payment ?? false);
        setLoanDate(pawnData.loan_date ? format(new Date(pawnData.loan_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
        setNotes(pawnData.notes || '');
        setStatus(pawnData.status as PawnStatus || PawnStatus.ON_TIME);
        setSelectedCustomerId(pawnData.customer_id);
        
        // Set collateral information from JSON
        if (pawnData.collateral_detail && typeof pawnData.collateral_detail === 'object') {
          setCollateralName(pawnData.collateral_detail.name || '');
          setCollateralAttributes(pawnData.collateral_detail.attributes || {});
          setCollateralQuantity(pawnData.collateral_detail.quantity?.toString() || '');
        } else if (typeof pawnData.collateral_detail === 'string') {
          // Handle legacy string format
          setCollateralName(pawnData.collateral_detail);
          setCollateralAttributes({});
          setCollateralQuantity('');
        } else {
          // Handle null/undefined case
          setCollateralName('');
          setCollateralAttributes({});
          setCollateralQuantity('');
        }
        
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
        const customer = customersData?.find(c => c.id === pawnData.customer_id);
        if (customer) {
          setCustomerName(customer.name);
        }
        
        // Load collateral info to get attributes
        if (pawnData.collateral_id) {
          try {
            const { data: collateralData, error: collateralError } = await getCollateralById(pawnData.collateral_id);
            if (!collateralError && collateralData) {
              setSelectedCollateral(collateralData);
            }
          } catch (err) {
            console.error('Error loading collateral:', err);
          }
        }

        // Check if pawn has any payments
        const { hasPaidPeriods, error: paymentsError } = await hasPawnAnyPayments(pawnId);
        if (paymentsError) {
          console.error('Error checking payments:', paymentsError);
        } else {
          setHasPayments(hasPaidPeriods);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Có lỗi xảy ra khi tải dữ liệu. Vui lòng thử lại sau.');
      } finally {
        setIsLoadingData(false);
      }
    }
    
    loadData();
  }, [isOpen, pawnId]);
  
  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Ensure we have a store selected
      if (!currentStore?.id) {
        throw new Error('Vui lòng chọn chi nhánh trước khi cập nhật hợp đồng');
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
      
      // Prepare collateral detail as JSON
      const collateralDetailJson: CollateralDetail = {
        name: collateralName,
        ...(collateralQuantity && parseInt(collateralQuantity) > 0
          ? { quantity: parseInt(collateralQuantity) }
          : {}),
        attributes: collateralAttributes
      };

      // Prepare update data
      const updateData: UpdatePawnParams = {
        customer_id: selectedCustomerId,
        contract_code: contractCode,
        collateral_id: collateralId,
        loan_amount: parseInt(loanAmount || '0'),
        interest_type: backendInterestType,
        interest_value: actualInterestValue,
        interest_ui_type: interestType, // Store the UI interest type
        interest_notation: interestNotation, // Store the notation format
        interest_period: convertInterestPeriodForStorage(interestPeriod, interestType),
        loan_date: new Date(loanDate),
        notes: notes,
        status,
        store_id: currentStore.id,
        collateral_detail: collateralDetailJson,
        is_advance_payment: isAdvancePayment,
      };
      
      // Call API to update pawn
      const { data, error } = await updatePawn(pawnId, updateData);
      
      if (error) throw error;
      
      // Success - close modal and notify parent
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      console.error('Error updating pawn:', err);
      setError('Có lỗi xảy ra khi cập nhật hợp đồng. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[400px] sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Chỉnh sửa hợp đồng cầm đồ</DialogTitle>
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
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="customerName" className="text-left sm:text-right font-medium">
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
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="contractCode" className="text-left sm:text-right font-medium">Mã HĐ</Label>
              <Input 
                id="contractCode"
                value={contractCode}
                onChange={(e) => setContractCode(e.target.value)}
                placeholder=""
                disabled
              />
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="idNumber" className="text-left sm:text-right font-medium">Số CCCD/Hộ chiếu</Label>
              <Input 
                id="idNumber"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder=""
                disabled
              />
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="phone" className="text-left sm:text-right font-medium">SĐT</Label>
              <Input 
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder=""
                disabled
              />
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
              <Label htmlFor="address" className="text-left sm:text-right font-medium sm:mt-2">Địa chỉ</Label>
              <Textarea 
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder=""
                disabled
              />
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="collateralId" className="text-left sm:text-right font-medium">
                {getDisplayLabelByBuild('collateral_for_pawn')} <span className="text-red-500">*</span>
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
            
            {/* Collateral Name */}
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="collateralName" className="text-left sm:text-right font-medium">
                Tên tài sản <span className="text-red-500">*</span>
              </Label>
              <Input
                id="collateralName"
                value={collateralName}
                onChange={(e) => setCollateralName(e.target.value)}
                placeholder="Ví dụ: Xe máy Honda Wave, Nhẫn vàng 18k..."
                required
              />
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="collateralQuantity" className="text-left sm:text-right font-medium">Số lượng</Label>
              <Input
                id="collateralQuantity"
                type="number"
                value={collateralQuantity}
                onChange={(e) => setCollateralQuantity(e.target.value)}
                placeholder="1"
                min={1}
                step={1}
                className="w-full sm:w-24"
              />
            </div>

            {selectedCollateral && (
              <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
                <div className="text-left sm:text-right text-sm text-gray-500">Thông tin tài sản:</div>
                <div className="text-sm bg-gray-50 p-2 rounded">
                  <div><span className="font-medium">Loại:</span> {selectedCollateral.category}</div>
                  <div><span className="font-medium">Mã:</span> {selectedCollateral.code}</div>
                  <div><span className="font-medium">Giá trị mặc định:</span> {formatNumber(selectedCollateral.default_amount || 0)}đ</div>
                </div>
              </div>
            )}

            {/* Dynamic collateral attributes based on selected collateral */}
            {selectedCollateral && (
              <div className="space-y-4">
                {/* Render dynamic attribute inputs */}
                {[
                  { key: 'attr_01', label: selectedCollateral.attr_01 },
                  { key: 'attr_02', label: selectedCollateral.attr_02 },
                  { key: 'attr_03', label: selectedCollateral.attr_03 },
                  { key: 'attr_04', label: selectedCollateral.attr_04 },
                  { key: 'attr_05', label: selectedCollateral.attr_05 }
                ].map(({ key, label }) => {
                  if (!label) return null;
                  
                  return (
                    <div key={key} className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
                      <Label htmlFor={key} className="text-left sm:text-right font-medium">{label}</Label>
                      <Input 
                        id={key}
                        value={collateralAttributes[key] || ''}
                        onChange={(e) => handleCollateralAttributeChange(key, e.target.value)}
                        placeholder={`Nhập ${label.toLowerCase()}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="loanAmount" className="text-left sm:text-right font-medium">
                {getDisplayLabelByBuild('tong_so_tien_vay')} <span className="text-red-500">*</span>
              </Label>
              <MoneyInput 
                id="loanAmount"
                value={loanAmount}
                onChange={handleLoanAmountChange}
                required
                placeholder="0"
              />
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="interestValue" className="text-left sm:text-right font-medium">
                Lãi suất <span className="text-red-500">*</span>
              </Label>
              <div>
                <div className="space-y-3 sm:space-y-0 sm:flex sm:gap-2 sm:items-center">
                  <Input 
                    id="interestValue"
                    type="text"
                    value={interestValue}
                    onChange={(e) => {
                      setInterestValue(e.target.value);
                      validateInterestRate(e.target.value, interestType, interestNotation);
                    }}
                    required
                    className="w-full sm:w-24"
                    placeholder="0"
                    min={0}
                    step="any"
                    disabled={hasPayments}
                  />
                  
                  {interestType === 'daily' && (
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 sm:items-center">
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
                          disabled={hasPayments}
                        />
                        <label htmlFor="k_per_million" className="text-xs sm:text-sm">k/1 triệu</label>
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
                          disabled={hasPayments}
                        />
                        <label htmlFor="k_per_day" className="text-xs sm:text-sm">k/ngày</label>
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
                          disabled={hasPayments}
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
                          disabled={hasPayments}
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
              <Label htmlFor="interestPeriod" className="text-left sm:text-right font-medium">
                {getDisplayLabelByBuild('ky_lai_phi')} <span className="text-red-500">*</span>
              </Label>
              <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                <Input 
                  id="interestPeriod"
                  type="number"
                  value={interestPeriod}
                  onChange={(e) => setInterestPeriod(e.target.value)}
                  className="w-full sm:w-24"
                  min="1"
                  placeholder="30"
                  required
                />
                <span className="text-xs sm:text-sm break-words">
                  {interestType === 'daily' && 'ngày (mỗi kỳ lãi)'}
                  {interestType === 'monthly_30' && 'tháng (mỗi kỳ lãi)'}
                  {interestType === 'monthly_custom' && 'ngày (mỗi kỳ lãi)'}
                  {interestType === 'weekly_percent' && 'tuần (mỗi kỳ lãi)'}
                  {interestType === 'weekly_k' && 'tuần (mỗi kỳ lãi)'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <div className="hidden sm:block"></div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isAdvancePayment"
                  checked={isAdvancePayment}
                  onChange={(e) => setIsAdvancePayment(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="isAdvancePayment" className="text-sm sm:text-base">
                  Thu lãi trước
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
              <Label htmlFor="loanDate" className="text-left sm:text-right font-medium">{getDisplayLabelByBuild('ngay_vay')} <span className="text-red-500">*</span></Label>
              <DatePicker
                value={loanDate}
                onChange={(value) => setLoanDate(value)}
                disabled={hasPayments || !hasPermission('sua_ngay_vay_cam_do')}
              />
            </div>
            
            <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
              <Label htmlFor="notes" className="text-left sm:text-right font-medium sm:mt-2">Ghi chú</Label>
              <Textarea 
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder=""
              />
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
                disabled={isLoading || pawn?.status === PawnStatus.CLOSED || pawn?.status === PawnStatus.DELETED}
              >
                {isLoading ? 'Đang xử lý...' : 'Cập nhật'}
              </Button>
              <Button 
                type="button" 
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 w-full sm:w-auto px-6"
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