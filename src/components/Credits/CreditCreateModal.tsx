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
// Không cần import CustomDateInput
// Using regular input radio buttons instead of RadioGroup component
import { createCredit } from '@/lib/credit';
import { getCustomers, createCustomer } from '@/lib/customer';
import { Customer } from '@/models/customer';
import { CreateCreditParams, InterestType, CreditStatus } from '@/models/credit';

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
  // State for form values
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [collateral, setCollateral] = useState('');
  const [loanAmount, setLoanAmount] = useState<string>('0');
  const [formattedLoanAmount, setFormattedLoanAmount] = useState<string>('0');
  const [interestType, setInterestType] = useState<string>('daily');
  const [interestNotation, setInterestNotation] = useState<string>('k_per_million');  // For tracking the selected radio button option
  const [interestValue, setInterestValue] = useState<string>('0');
  const [loanPeriod, setLoanPeriod] = useState<string>('30');
  const [interestPeriod, setInterestPeriod] = useState<string>('10');
  const [loanDate, setLoanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [advancePayment, setAdvancePayment] = useState(false);
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Quick buttons for loan amount
  const loanAmountPresets = [-5, +5, 10, 20, 30, 40, 50];
  
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
  
  // Handle interest type change
  const handleInterestTypeChange = (value: string) => {
    setInterestType(value);
    
    // Set default notation and update interest period based on interest type
    switch(value) {
      case 'daily':
        setInterestNotation('k_per_million');
        // Để nguyên interest period vì đã đúng đơn vị ngày
        break;
      case 'monthly_30':
        setInterestNotation('percent_per_month');
        // Cập nhật thành 30 ngày (1 tháng 30 ngày)
        setInterestPeriod('30');
        break;
      case 'monthly_custom':
        setInterestNotation('percent_per_month');
        // Cập nhật thành 30 ngày (1 tháng mặc định)
        setInterestPeriod('30');
        break;
      case 'weekly_percent':
        setInterestNotation('percent_per_week');
        // Cập nhật thành 7 ngày (1 tuần)
        setInterestPeriod('7');
        break;
      case 'weekly_k':
        setInterestNotation('k_per_week');
        // Cập nhật thành 7 ngày (1 tuần)
        setInterestPeriod('7');
        break;
      default:
        setInterestNotation('k_per_million');
    }
  };
  
  // Quick loan amount adjustment
  const adjustLoanAmount = (amount: number) => {
    const newAmount = parseInt(loanAmount || '0') + amount;
    const newAmountStr = newAmount > 0 ? newAmount.toString() : '0';
    setLoanAmount(newAmountStr);
    setFormattedLoanAmount(formatNumber(newAmountStr));
  };
  
  // Get current store from context
  const { currentStore } = useStore();
  
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
      if (interestType === 'daily') {
        backendInterestType = InterestType.FIXED_AMOUNT;
      } else if (interestType === 'monthly_30' || interestType === 'monthly_custom' || 
                 interestType === 'weekly_percent') {
        backendInterestType = InterestType.PERCENTAGE;
      } else if (interestType === 'weekly_k') {
        backendInterestType = InterestType.FIXED_AMOUNT;
      }
      
      // Prepare credit data
      const creditData: CreateCreditParams = {
        customer_id: finalCustomerId,
        contract_code: contractCode,
        id_number: idNumber,
        phone,
        address,
        collateral,
        loan_amount: parseInt(loanAmount || '0'),
        interest_type: backendInterestType,
        interest_value: parseFloat(interestValue || '0'),
        interest_ui_type: interestType, // Store the UI interest type
        interest_notation: interestNotation, // Store the notation format
        loan_period: parseInt(loanPeriod || '30'),
        interest_period: parseInt(interestPeriod || '10'),
        loan_date: new Date(loanDate),
        status: CreditStatus.ON_TIME,
        notes: notes,
        store_id: currentStore.id, // Use store ID from context
      };
      
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
      setError('Có lỗi xảy ra khi tạo hợp đồng. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
            <Input 
              id="contractCode"
              value={contractCode}
              onChange={(e) => setContractCode(e.target.value)}
              placeholder="Mã hợp đồng"
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="idNumber" className="text-right">Số CCCD/Hộ chiếu</Label>
            <Input 
              id="idNumber"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="phone" className="text-right">SĐT</Label>
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
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
            <Label htmlFor="collateral" className="text-right mt-2">Tài sản thế chấp</Label>
            <Textarea 
              id="collateral"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              rows={3}
            />
          </div>
          
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
              Lãi phí <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center space-x-4">
              <Input 
                id="interestValue"
                type="number"
                value={interestValue}
                onChange={(e) => setInterestValue(e.target.value)}
                required
                className="w-32"
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
                        onChange={() => setInterestNotation('k_per_million')}
                        className="mr-2"
                      />
                      <label htmlFor="interestDaily1" className="text-sm">k/1 triệu</label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="interestDaily2" 
                        name="interestDaily" 
                        checked={interestNotation === 'k_per_day'}
                        onChange={() => setInterestNotation('k_per_day')}
                        className="mr-2"
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
                        onChange={() => setInterestNotation('percent_per_month')}
                        className="mr-2"
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
                        onChange={() => setInterestNotation('percent_per_week')}
                        className="mr-2"
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
                      />
                      <label htmlFor="interestWeeklyK1" className="text-sm">k/1 tuần (VD: 100k/1 tuần)</label>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="loanPeriod" className="text-right">
              Số ngày vay <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="loanPeriod"
              type="number"
              value={loanPeriod}
              onChange={(e) => setLoanPeriod(e.target.value)}
              required
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="interestPeriod" className="text-right">
              Kỳ lãi phí <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center space-x-2">
              <Input 
                id="interestPeriod"
                type="number"
                value={interestPeriod}
                onChange={(e) => setInterestPeriod(e.target.value)}
                required
                className="w-32"
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
              onChange={setLoanDate}
              required
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
            <div className="text-red-500 text-center">{error}</div>
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
