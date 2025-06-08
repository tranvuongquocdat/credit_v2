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
import { getPawnById, updatePawn } from '@/lib/pawn';
import { getCustomers } from '@/lib/customer';
import { getCollateralById } from '@/lib/collateral';
import { Customer } from '@/models/customer';
import { PawnStatus, UpdatePawnParams, Pawn } from '@/models/pawn';
import { toast } from '@/components/ui/use-toast';

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
  
  // State for form values
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [formattedLoanAmount, setFormattedLoanAmount] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('');
  const [loanPeriod, setLoanPeriod] = useState<string>('');
  const [pawnDate, setPawnDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [maturityDate, setMaturityDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<PawnStatus>(PawnStatus.ON_TIME);
  
  // State for collateral details
  const [collateralName, setCollateralName] = useState('');
  const [collateralAttributes, setCollateralAttributes] = useState<Record<string, string>>({});
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  // State for collateral info
  const [selectedCollateral, setSelectedCollateral] = useState<any>(null);
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pawn, setPawn] = useState<Pawn | null>(null);
  
  // State for interest rate validation warning
  const [interestRateWarning, setInterestRateWarning] = useState<string | null>(null);
  
  // Function to validate interest rate (for pawn monthly percentage)
  const validateInterestRate = (value: string) => {
    const numValue = parseFloat(value || '0');
    if (isNaN(numValue) || numValue <= 0) {
      setInterestRateWarning(null);
      return;
    }
    
    // For pawn interest rate (monthly percentage), check if > 8.3%
    if (numValue > 8.3) {
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
    const rawValue = e.target.value.replace(/\./g, '');
    setLoanAmount(rawValue);
    setFormattedLoanAmount(formatNumber(rawValue));
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
        const loanAmountStr = pawnData.loan_amount?.toString() || '';
        setLoanAmount(loanAmountStr);
        setFormattedLoanAmount(formatNumber(loanAmountStr));
        setInterestRate(pawnData.interest_value?.toString() || '');
        setLoanPeriod(pawnData.loan_period?.toString() || '');
        setPawnDate(pawnData.loan_date ? format(new Date(pawnData.loan_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
        // Calculate maturity date from loan_date and loan_period
        if (pawnData.loan_date && pawnData.loan_period) {
          const loanDate = new Date(pawnData.loan_date);
          const maturityDate = new Date(loanDate);
          maturityDate.setDate(loanDate.getDate() + pawnData.loan_period);
          setMaturityDate(format(maturityDate, 'yyyy-MM-dd'));
        }
        setNotes(pawnData.notes || '');
        setStatus(pawnData.status as PawnStatus || PawnStatus.ON_TIME);
        setSelectedCustomerId(pawnData.customer_id);
        
        // Set collateral information from JSON
        if (pawnData.collateral_detail && typeof pawnData.collateral_detail === 'object') {
          setCollateralName(pawnData.collateral_detail.name || '');
          setCollateralAttributes(pawnData.collateral_detail.attributes || {});
        } else if (typeof pawnData.collateral_detail === 'string') {
          // Handle legacy string format
          setCollateralName(pawnData.collateral_detail);
          setCollateralAttributes({});
        }
        
        // Load customers list
        const { data: customersData, error: customersError } = await getCustomers(1, 1000);
        
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
      
      // Prepare collateral detail as JSON
      const collateralDetailJson = {
        name: collateralName,
        attributes: collateralAttributes
      };

      // Prepare update data
      const updateData: UpdatePawnParams = {
        customer_id: selectedCustomerId,
        contract_code: contractCode,
        loan_amount: parseInt(loanAmount || '0'),
        interest_value: parseFloat(interestRate || '0'),
        loan_period: parseInt(loanPeriod || '0'),
        loan_date: new Date(pawnDate),
        notes: notes,
        status,
        store_id: currentStore.id,
        collateral_detail: collateralDetailJson
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
      <DialogContent className="sm:max-w-[800px] md:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
                placeholder=""
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="idNumber" className="text-right">Số CCCD/Hộ chiếu</Label>
              <Input 
                id="idNumber"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder=""
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="phone" className="text-right">SĐT</Label>
              <Input 
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder=""
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
              <Label htmlFor="address" className="text-right mt-2">Địa chỉ</Label>
              <Textarea 
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder=""
              />
            </div>
            
            {/* Collateral Name */}
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="collateralName" className="text-right">
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
                    <div key={key} className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
                      <Label htmlFor={key} className="text-right">{label}</Label>
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
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="loanAmount" className="text-right">
                Số tiền vay <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="loanAmount"
                type="text"
                value={formattedLoanAmount}
                onChange={handleLoanAmountChange}
                required
                inputMode="numeric"
                placeholder="0"
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="interestRate" className="text-right">
                Lãi suất (%/tháng) <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="interestRate"
                type="number"
                value={interestRate}
                onChange={(e) => {
                  setInterestRate(e.target.value);
                  validateInterestRate(e.target.value);
                }}
                required
                placeholder="0"
                step="0.1"
              />
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
                Thời hạn (tháng) <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="loanPeriod"
                type="number"
                value={loanPeriod}
                onChange={(e) => setLoanPeriod(e.target.value)}
                required
                placeholder="0"
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="pawnDate" className="text-right">
                Ngày cầm <span className="text-red-500">*</span>
              </Label>
              <DatePicker
                id="pawnDate"
                value={pawnDate}
                onChange={setPawnDate}
                required
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="maturityDate" className="text-right">
                Ngày đáo hạn
              </Label>
              <DatePicker
                id="maturityDate"
                value={maturityDate}
                onChange={setMaturityDate}
              />
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="status" className="text-right">
                Trạng thái
              </Label>
              <select 
                className="border rounded-md p-2 w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value as PawnStatus)}
              >
                <option value={PawnStatus.ON_TIME}>Đang vay</option>
                <option value={PawnStatus.OVERDUE}>Quá hạn</option>
                <option value={PawnStatus.LATE_INTEREST}>Chậm lãi</option>
                <option value={PawnStatus.BAD_DEBT}>Nợ xấu</option>
                <option value={PawnStatus.CLOSED}>Đã đóng</option>
                <option value={PawnStatus.DELETED}>Đã xóa</option>
              </select>
            </div>
            
            <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
              <Label htmlFor="notes" className="text-right mt-2">Ghi chú</Label>
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