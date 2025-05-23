'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle } from 'lucide-react';
import { createInstallment } from '@/lib/installment';
import { getCustomers, createCustomer } from '@/lib/customer';
import { getEmployees } from '@/lib/employee';
import { updateStoreCashFundOnly, getStoreById } from '@/lib/store';
import { Customer } from '@/models/customer';
import { Employee } from '@/models/employee';
import { InstallmentStatus } from '@/models/installment';
import Spinner from '@/components/ui/spinner';
import { useToast } from '@/components/ui/use-toast';
import { useStore } from '@/contexts/StoreContext';

interface InstallmentCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InstallmentCreateModal({ 
  isOpen, 
  onClose, 
  onSuccess 
}: InstallmentCreateModalProps) {
  // Toast notifications
  const { toast } = useToast();
  
  // Get current store from context
  const { currentStore } = useStore();
  
  // State for form values
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [amountGiven, setAmountGiven] = useState<string>('');
  const [formattedAmountGiven, setFormattedAmountGiven] = useState<string>('');
  const [duration, setDuration] = useState<string>('50');
  const [paymentPeriod, setPaymentPeriod] = useState<string>('10');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('');
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  
  // State for employees dropdown
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Quick buttons for loan amount
  const amountPresets = [-5, 10, 15, 20, 25, 30, 40, 50];
  
  // For the second input field - tiền đưa khách
  const [customerAmount, setCustomerAmount] = useState<string>('');
  const [formattedCustomerAmount, setFormattedCustomerAmount] = useState<string>('');
  
  // Additional state for contract code generation
  const [autoGenerateCode, setAutoGenerateCode] = useState<boolean>(true);
  
  // Function to reset form fields
  const resetForm = () => {
    setCustomerType('new');
    setCustomerName('');
    setContractCode('');
    setIdNumber('');
    setPhone('');
    setAddress('');
    setAmountGiven('');
    setFormattedAmountGiven('');
    setDuration('50');
    setPaymentPeriod('10');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
    setEmployeeId('');
    setSelectedCustomerId('');
    setCustomerAmount('');
    setFormattedCustomerAmount('');
    setError(null);
    setAutoGenerateCode(true);
  };
  
  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    // Convert to number and back to string to remove non-numeric characters
    const numericValue = value.toString().replace(/[^0-9]/g, '');
    // Format with thousand separators
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  
  // Handle amount change for trả góp
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    setAmountGiven(rawValue);
    setFormattedAmountGiven(formatNumber(rawValue));
  };
  
  // Handle amount change for tiền đưa khách
  const handleCustomerAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    setCustomerAmount(rawValue);
    setFormattedCustomerAmount(formatNumber(rawValue));
  };

  // Load customers and employees for dropdowns
  useEffect(() => {
    if (!isOpen) return;
    
    async function loadData() {
      setIsLoadingCustomers(true);
      setIsLoadingEmployees(true);
      
      try {
        // Load customers
        const { data: customersData, error: customersError } = await getCustomers(1, 1000);
        if (customersError) throw customersError;
        setCustomers(customersData || []);
        
        // Load employees filtered by current store if available
        const { data: employeesData, error: employeesError } = await getEmployees(
          1, 
          1000, 
          '', // search query
          currentStore?.id || '' // filter by store_id from context
        );
        
        if (employeesError) throw employeesError;
        setEmployees(employeesData || []);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsLoadingCustomers(false);
        setIsLoadingEmployees(false);
      }
    }
    
    loadData();
  }, [isOpen, currentStore]);
  
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
  
  // Quick amount adjustment
  const adjustAmount = (amount: number) => {
    const newAmount = parseInt(amountGiven || '0') + amount;
    if (newAmount >= 0) {
      setAmountGiven(newAmount.toString());
      setFormattedAmountGiven(formatNumber(newAmount));
    }
  };
  
  // Quick amount adjustment for tiền đưa khách
  const adjustCustomerAmount = (amount: number) => {
    const newAmount = parseInt(customerAmount || '0') + amount;
    if (newAmount >= 0) {
      setCustomerAmount(newAmount.toString());
      setFormattedCustomerAmount(formatNumber(newAmount));
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
  
  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Validate required fields
      if (customerType === 'existing' && !selectedCustomerId) {
        throw new Error('Vui lòng chọn khách hàng');
      }
      
      if (customerType === 'new' && !customerName.trim()) {
        throw new Error('Vui lòng nhập tên khách hàng');
      }
      
      if (!employeeId) {
        throw new Error('Vui lòng chọn nhân viên');
      }
      
      // Find selected employee to get their store
      const selectedEmployee = employees.find(e => e.uid === employeeId);
      if (!selectedEmployee) {
        throw new Error('Không tìm thấy thông tin nhân viên');
      }
      
      if (!selectedEmployee.store_id) {
        throw new Error('Nhân viên chưa được gán cho cửa hàng');
      }
      
      const downPayment = parseInt(customerAmount || '0');
      const installmentAmount = parseInt(amountGiven || '0');
      
      if (downPayment <= 0) {
        throw new Error('Tiền đưa khách phải lớn hơn 0');
      }
      
      if (installmentAmount <= 0) {
        throw new Error('Tiền trả góp phải lớn hơn 0');
      }
      
      const loanPeriod = parseInt(duration || '50');
      const paymentPrd = parseInt(paymentPeriod || '10');
      
      if (loanPeriod <= 0) {
        throw new Error('Thời gian vay phải lớn hơn 0');
      }
      
      if (paymentPrd <= 0) {
        throw new Error('Kỳ hạn trả nợ phải lớn hơn 0');
      }
      
      // Kiểm tra số dư quỹ của cửa hàng
      const { data: storeData, error: storeError } = await getStoreById(selectedEmployee.store_id);
      if (storeError) {
        throw new Error('Không thể lấy thông tin cửa hàng');
      }
      
      // Kiểm tra xem quỹ có đủ tiền không
      const currentCashFund = storeData?.cash_fund || 0;
      if (currentCashFund < downPayment) {
        throw new Error(`Quỹ tiền mặt không đủ để tạo hợp đồng. Quỹ hiện tại: ${formatNumber(currentCashFund)}, Cần: ${formatNumber(downPayment)}`);
      }
      
      // Get or create customer
      let finalCustomerId = selectedCustomerId;
      let finalCustomerName = '';
      
      // For new customers, create in database first
      if (customerType === 'new') {
        // Create new customer with the employee's store_id
        const newCustomer = {
          name: customerName,
          store_id: selectedEmployee.store_id,
          phone: phone || undefined,
          address: address || undefined,
          id_number: idNumber || undefined
        };
        
        const { data: createdCustomer, error: customerError } = await createCustomer(newCustomer);
        
        if (customerError) {
          throw new Error(`Lỗi tạo khách hàng: ${String(customerError)}`);
        }
        
        if (!createdCustomer || !createdCustomer.id) {
          throw new Error('Không thể tạo khách hàng mới');
        }
        
        finalCustomerId = createdCustomer.id;
        finalCustomerName = customerName;
      } else {
        // Get customer name for existing customer
        const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
        finalCustomerName = selectedCustomer?.name || '';
      }
      
      // Prepare installment data
      const installmentData = {
        customer_id: finalCustomerId,
        employee_id: employeeId,
        contract_code: contractCode,
        down_payment: downPayment,
        installment_amount: installmentAmount,
        loan_period: loanPeriod,
        payment_period: paymentPrd,
        loan_date: startDate,
        notes: notes || '',
        status: InstallmentStatus.ON_TIME
      };
      
      // Call API to create installment
      const { data: newInstallment, error } = await createInstallment(installmentData);
      
      if (error) throw error;
      
      // Cập nhật số dư quỹ tiền của cửa hàng - trừ đi số tiền đã giao cho khách
      const { success, error: updateError } = await updateStoreCashFundOnly(
        selectedEmployee.store_id,
        -downPayment // Trừ số tiền giao khách (down_payment)
      );
      
      if (!success || updateError) {
        console.error('Error updating store cash fund:', updateError);
        throw new Error('Không thể cập nhật quỹ tiền mặt của cửa hàng');
      }
      
      // Success - close modal and notify parent
      const successMessage = customerType === 'new' 
        ? "Đã tạo khách hàng mới và hợp đồng trả góp" 
        : "Đã tạo hợp đồng trả góp mới";
        
      toast({
        title: "Thành công",
        description: successMessage,
      });
      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating installment:', err);
      setError(err.message || 'Có lỗi xảy ra khi tạo hợp đồng. Vui lòng thử lại.');
      toast({
        title: "Lỗi",
        description: err.message || "Không thể tạo hợp đồng trả góp",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        resetForm();
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[800px] md:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Hợp đồng trả góp</DialogTitle>
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
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="amountGiven" className="text-right">
              Tiền trả góp <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <Input 
                id="amountGiven"
                type="text"
                value={formattedAmountGiven}
                onChange={handleAmountChange}
                required
                inputMode="numeric"
                className="w-48"
                placeholder="0"
              />
              <span className="text-sm text-gray-500">(Tổng tiền vay khách phải thanh toán)</span>
            </div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="tiendua" className="text-right">
              Tiền đưa khách <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <Input 
                id="tiendua"
                type="text"
                value={formattedCustomerAmount}
                onChange={handleCustomerAmountChange}
                required
                inputMode="numeric"
                className="w-48"
                placeholder="0"
              />
              <span className="text-sm text-gray-500">(Tổng tiền khách nhận được)</span>
            </div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="duration" className="text-right">
              Thời gian vay <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input 
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                  className="w-24"
                />
                <span>ngày</span>
              </div>
              <span className="text-sm text-gray-500">
                {`(Thanh toán ${formatNumber(Math.round(parseInt(amountGiven || '0') / (parseInt(duration || '50') || 1)))} / 1 ngày)`}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="paymentPeriod" className="text-right">
              Số ngày đóng tiền <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input 
                  id="paymentPeriod"
                  type="number"
                  value={paymentPeriod}
                  onChange={(e) => setPaymentPeriod(e.target.value)}
                  required
                  className="w-24"
                />
                <span>ngày</span>
              </div>
              <span className="text-sm text-gray-500">(10 ngày đóng 1 lần thì điền số 10)</span>
            </div>
          </div>
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="startDate" className="text-right">Ngày vay</Label>
            <DatePicker 
              id="startDate"
              value={startDate}
              onChange={setStartDate}
              required
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="employeeId" className="text-right">
              Nhân viên đảm nhiệm <span className="text-red-500">*</span>
            </Label>
            <select 
              id="employeeId"
              className="border rounded-md p-2 w-full"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">Chọn nhân viên</option>
              {employees.map(employee => (
                <option key={employee.uid} value={employee.uid}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </div>
          
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
            <Label htmlFor="notes" className="text-right mt-2">Ghi chú</Label>
            <Textarea 
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
          
          <div className="flex justify-center pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? <Spinner className="mr-2" /> : null}
              Thêm mới
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
