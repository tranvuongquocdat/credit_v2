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
  const [interestType, setInterestType] = useState<'percentage' | 'fixed'>('percentage');
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
  const loanAmountPresets = [-5, +5, 10, 20, 50, 40, 50];
  
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
        setLoanAmount(creditData.loan_amount?.toString() || '0');
        setInterestType(creditData.interest_type === InterestType.PERCENTAGE ? 'percentage' : 'fixed');
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
    setLoanAmount(newAmount > 0 ? newAmount.toString() : '0');
  };
  
  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Prepare update data
      const updateData: UpdateCreditParams = {
        customer_id: selectedCustomerId,
        contract_code: contractCode,
        id_number: idNumber,
        phone,
        address,
        collateral,
        loan_amount: parseInt(loanAmount || '0'),
        interest_type: interestType === 'percentage' ? InterestType.PERCENTAGE : InterestType.FIXED_AMOUNT,
        interest_value: parseFloat(interestValue || '0'),
        loan_period: parseInt(loanPeriod || '30'),
        interest_period: parseInt(interestPeriod || '10'),
        loan_date: new Date(loanDate),
        notes,
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
                  type="number"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  required
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
                onChange={(e) => setInterestType(e.target.value as 'percentage' | 'fixed')}
              >
                <option value="percentage">Lãi phí ngày</option>
                <option value="fixed">Lãi phí cố định</option>
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
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <input 
                      type="radio" 
                      id="interestOption1" 
                      name="interestOption" 
                      checked={true}
                      className="mr-2"
                    />
                    <label htmlFor="interestOption1">k/1 triệu</label>
                  </div>
                  
                  <div className="flex items-center">
                    <input 
                      type="radio" 
                      id="interestOption2" 
                      name="interestOption"
                      checked={false}
                      className="mr-2"
                    />
                    <label htmlFor="interestOption2">k/1 ngày</label>
                  </div>
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
                  (VD : 10 ngày đóng lãi phí 1 lần thì điền số 10 )
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
