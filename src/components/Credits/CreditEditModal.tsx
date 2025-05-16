'use client';

import { useState, useEffect } from 'react';
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
import { getCreditById, updateCredit } from '@/lib/credit';
import { getCustomers } from '@/lib/customer';
import { Customer } from '@/models/customer';
import { UpdateCreditParams, InterestType, CreditStatus, Credit, CreditWithCustomer } from '@/models/credit';

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
  // State for form values
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
  
  // Handle interest type change
  const handleInterestTypeChange = (value: string) => {
    setInterestType(value);
    
    // Set default notation based on interest type
    switch(value) {
      case 'daily':
        setInterestNotation('k_per_million');
        break;
      case 'monthly_30':
      case 'monthly_custom':
        setInterestNotation('percent_per_month');
        break;
      case 'weekly_percent':
        setInterestNotation('percent_per_week');
        break;
      case 'weekly_k':
        setInterestNotation('k_per_week');
        break;
      default:
        setInterestNotation('k_per_million');
    }
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
        
        // Set form values from credit data
        setContractCode(creditData.contract_code || '');
        setIdNumber(creditData.id_number || '');
        setPhone(creditData.phone || '');
        setAddress(creditData.address || '');
        setCollateral(creditData.collateral || '');
        const loanAmountStr = creditData.loan_amount?.toString() || '0';
        setLoanAmount(loanAmountStr);
        setFormattedLoanAmount(formatNumber(loanAmountStr));
        // Extract interest type from notes if available
        let detectedInterestType = 'daily';
        let detectedNotation = 'k_per_million';
        if (creditData.notes) {
          // Check for saved interest mode pattern
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
        setLoanPeriod(creditData.loan_period?.toString() || '30');
        setInterestPeriod(creditData.interest_period?.toString() || '10');
        setLoanDate(creditData.loan_date ? format(new Date(creditData.loan_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
        setNotes(creditData.notes || '');
        setStatus(creditData.status as CreditStatus || CreditStatus.ON_TIME);
        setSelectedCustomerId(creditData.customer_id);
        
        // Load customers list
        const { data: customersData, error: customersError } = await getCustomers(1, 1000);
        
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
      
      // Prepare update data
      const updateData: UpdateCreditParams = {
        customer_id: selectedCustomerId,
        contract_code: contractCode,
        id_number: idNumber,
        phone,
        address,
        collateral,
        loan_amount: parseInt(loanAmount || '0'),
        interest_type: backendInterestType,
        interest_value: parseFloat(interestValue || '0'),
        loan_period: parseInt(loanPeriod || '30'),
        interest_period: parseInt(interestPeriod || '10'),
        loan_date: new Date(loanDate),
        notes: notes + (interestType !== 'daily' ? ` [${interestType}]` : ''),
        status,
      };
      
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
              <Input 
                id="customerName"
                value={customerName}
                readOnly
                className="bg-gray-50"
              />
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
              <Input 
                id="loanDate"
                type="date"
                value={loanDate}
                onChange={(e) => setLoanDate(e.target.value)}
                required
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="status" className="text-right">
                Trạng thái
              </Label>
              <select 
                className="border rounded-md p-2 w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value as CreditStatus)}
              >
                <option value={CreditStatus.ON_TIME}>Đúng hẹn</option>
                <option value={CreditStatus.OVERDUE}>Quá hạn</option>
                <option value={CreditStatus.LATE_INTEREST}>Chậm lãi</option>
                <option value={CreditStatus.BAD_DEBT}>Nợ xấu</option>
                <option value={CreditStatus.CLOSED}>Đã đóng</option>
              </select>
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
            
            <div className="flex justify-center space-x-4 mt-6">
              <Button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isLoading}
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
