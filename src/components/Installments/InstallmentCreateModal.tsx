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
import { Customer } from '@/models/customer';
import { Employee } from '@/models/employee';
import { InstallmentStatus } from '@/models/installment';
import Spinner from '@/components/ui/spinner';
import { useToast } from '@/components/ui/use-toast';
import { useStore } from '@/contexts/StoreContext';
import { MoneyInput } from '@/components/ui/money-input';

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
  const [duration, setDuration] = useState<string>('');
  const [paymentPeriod, setPaymentPeriod] = useState<string>('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('');
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  
  // Add state for customer search
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
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
    setDuration('');
    setPaymentPeriod('');
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
    const rawValue = e.target.value;
    setAmountGiven(rawValue);
    setFormattedAmountGiven(formatNumber(rawValue));
  };
  
  // Handle amount change for tiền đưa khách
  const handleCustomerAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
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
        // Load customers filtered by current store
        const { data: customersData, error: customersError } = await getCustomers(
          1, 
          1000, 
          '', // search query
          currentStore?.id || '', // filter by store_id from context
          '' // status filter
        );
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
      } as any; // Type assertion to avoid TypeScript error
      
      // Calculate initial payment_due_date as start_date + paymentPeriod - 1
      const startDateObj = new Date(startDate);
      const paymentDueDate = new Date(startDateObj);
      paymentDueDate.setDate(startDateObj.getDate() + paymentPrd - 1);
      installmentData.payment_due_date = format(paymentDueDate, 'yyyy-MM-dd');
      
      // Call API to create installment
      await createInstallment(installmentData);
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
      <DialogContent className="w-[95vw] max-w-[400px] sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] max-h-[90vh] overflow-y-auto">
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
                placeholder=""
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
              placeholder=""
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="phone" className="text-left sm:text-right font-medium">SĐT</Label>
            <Input 
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder=""
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
            <Label htmlFor="address" className="text-left sm:text-right font-medium sm:mt-2">Địa chỉ</Label>
            <Textarea 
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder=""
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="amountGiven" className="text-left sm:text-right font-medium">
              Tiền trả góp <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
              <MoneyInput 
                id="amountGiven"
                value={amountGiven}
                onChange={handleAmountChange}
                onFocus={e => {
                  if (!amountGiven || amountGiven === "0") e.target.select();
                }}
                required
                className="w-full sm:w-48"
                placeholder="0"
              />
              <span className="text-xs sm:text-sm text-gray-500 break-words">(Tổng tiền vay khách phải thanh toán)</span>
            </div>
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="tiendua" className="text-left sm:text-right font-medium">
              Tiền đưa khách <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
              <MoneyInput 
                id="tiendua"
                value={customerAmount}
                onChange={handleCustomerAmountChange}
                onFocus={e => {
                  if (!customerAmount || customerAmount === "0") e.target.select();
                }}
                required
                className="w-full sm:w-48"
                placeholder="0"
              />
              <span className="text-xs sm:text-sm text-gray-500 break-words">(Tổng tiền khách nhận được)</span>
            </div>
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="duration" className="text-left sm:text-right font-medium">
              Thời gian vay <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Input 
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                  className="w-full sm:w-24"
                  placeholder="0"
                  min={0}
                />
                <span className="text-sm">ngày</span>
              </div>
              <span className="text-xs sm:text-sm text-gray-500 break-words">
                {`(Thanh toán ${formatNumber(Math.round(parseInt(amountGiven || '0') / (parseInt(duration || '50') || 1)))} / 1 ngày)`}
              </span>
            </div>
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="paymentPeriod" className="text-left sm:text-right font-medium">
              Số ngày đóng tiền <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Input 
                  id="paymentPeriod"
                  type="number"
                  value={paymentPeriod}
                  onChange={(e) => setPaymentPeriod(e.target.value)}
                  required
                  className="w-full sm:w-24"
                  placeholder="0"
                  min={0}
                />
                <span className="text-sm">ngày</span>
              </div>
              <span className="text-xs sm:text-sm text-gray-500 break-words">(10 ngày đóng 1 lần thì điền số 10)</span>
            </div>
          </div>
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="startDate" className="text-left sm:text-right font-medium">Ngày vay</Label>
            <DatePicker 
              id="startDate"
              value={startDate}
              onChange={setStartDate}
              required
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="employeeId" className="text-left sm:text-right font-medium">
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
          
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
            <Label htmlFor="notes" className="text-left sm:text-right font-medium sm:mt-2">Ghi chú</Label>
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
          
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto px-6"
            >
              {isLoading ? <Spinner className="mr-2" /> : null}
              Thêm mới
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
