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
import { getInstallmentById, updateInstallment } from '@/lib/installment';
import { getCustomers } from '@/lib/customer';
import { getEmployees } from '@/lib/employee';
import { hasInstallmentAnyPayments } from '@/lib/installmentPayment';
import { Installment } from '@/models/installment';
import { Customer } from '@/models/customer';
import { Employee } from '@/models/employee';
import Spinner from '@/components/ui/spinner';
import { useStore } from '@/contexts/StoreContext';
import { MoneyInput } from '@/components/ui/money-input';

interface InstallmentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  installmentId: string;
  onSuccess: () => void;
}

export function InstallmentEditModal({ 
  isOpen, 
  onClose, 
  installmentId,
  onSuccess 
}: InstallmentEditModalProps) {
  // Get current store from context
  const { currentStore } = useStore();
  // State for form values
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [amountGiven, setAmountGiven] = useState<string>('');
  const [formattedAmountGiven, setFormattedAmountGiven] = useState<string>('');
  const [customerAmount, setCustomerAmount] = useState<string>('');
  const [formattedCustomerAmount, setFormattedCustomerAmount] = useState<string>('');
  const interestRate = '10';
  const [duration, setDuration] = useState<string>('');
  const [paymentPeriod, setPaymentPeriod] = useState<string>('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const advancePayment = false;
  const [employeeId, setEmployeeId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  // State for employees dropdown
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  // State to track if installment has payments
  const [hasPayments, setHasPayments] = useState<boolean>(false);
  
  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installment, setInstallment] = useState<Installment | null>(null);
  
  
  // Format number with thousand separators
  const formatNumber = (value: string | number): string => {
    const numericValue = value.toString().replace(/[^0-9]/g, '');
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

  // Load installment data and customers
  useEffect(() => {
    if (!installmentId || !isOpen) return;
    
    async function loadData() {
      setIsLoadingData(true);
      setError(null);
      
      try {
        // Load installment
        const { data: installmentData, error: installmentError } = await getInstallmentById(installmentId);
        if (installmentError) throw new Error('Không thể tải dữ liệu hợp đồng');
        if (!installmentData) throw new Error('Không tìm thấy hợp đồng');
        
        setInstallment(installmentData);
        
        // Check if installment has any payments
        const { hasPaidPeriods, error: paymentsError } = await hasInstallmentAnyPayments(installmentId);
        if (paymentsError) {
          console.error('Error checking payments:', paymentsError);
        } else {
          setHasPayments(hasPaidPeriods);
        }
        
        // Set form values from installment data
        setCustomerName(installmentData.customer?.name || '');
        setContractCode(installmentData.contract_code || '');
        setIdNumber(installmentData.customer?.id_number || '');
        setPhone(installmentData.customer?.phone || '');
        setAddress(installmentData.customer?.address || '');
        if (installmentData) {
          setContractCode(installmentData.contract_code || '');
          setAmountGiven(installmentData.installment_amount?.toString() || '');
          setFormattedAmountGiven(formatNumber(installmentData.installment_amount?.toString() || ''));
          setCustomerAmount(installmentData.amount_given?.toString() || '');
          setFormattedCustomerAmount(formatNumber(installmentData.amount_given?.toString() || ''));
          setDuration(installmentData.duration?.toString() || '');
          setPaymentPeriod(installmentData.payment_period?.toString() || '');
          setStartDate(installmentData.start_date ? format(new Date(installmentData.start_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
          setSelectedCustomerId(installmentData.customer_id || '');
          setEmployeeId(installmentData.employee_id || '');
          setStatus(installmentData.status || '');
        }
        
        if (installmentData.customer_id) {
          setSelectedCustomerId(installmentData.customer_id);
        }
        
        // Load customers filtered by current store
        const { data: customersData, error: customersError } = await getCustomers(
          1, 
          1000, 
          '', // search query
          currentStore?.id || '', // filter by store_id from context
          '' // status filter
        );
        if (customersError) throw new Error('Không thể tải danh sách khách hàng');
        setCustomers(customersData || []);
        
        // Load employees
        const { data: employeesData, error: employeesError } = await getEmployees(1, 1000, '', currentStore?.id || '');
        if (employeesError) throw new Error('Không thể tải danh sách nhân viên');
        setEmployees(employeesData || []);
      } catch (err: any) {
        console.error('Error loading data:', err);
        setError(typeof err === 'string' ? err : err.message || 'Có lỗi xảy ra khi tải dữ liệu');
      } finally {
        setIsLoadingData(false);
      }
    }
    
    loadData();
  }, [installmentId, isOpen]);
  
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
  
  // Quick amount adjustment for trả góp
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

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installment) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Prepare installment data
      const installmentData: any = {};
      
      // Always include these fields
      installmentData.notes = notes;
      installmentData.payment_period = parseInt(paymentPeriod || '10');
      installmentData.employee_id = employeeId;
      // Only include these fields if no payments exist
      if (!hasPayments) {
        installmentData.customer_id = selectedCustomerId;
        installmentData.customer_name = customerName;
        installmentData.contract_code = contractCode;
        installmentData.id_number = idNumber;
        installmentData.phone = phone;
        installmentData.address = address;
        installmentData.installment_amount = parseInt(amountGiven || '0');
        installmentData.down_payment = parseInt(customerAmount || '0');
        installmentData.interest_rate = parseFloat(interestRate || '0');
        installmentData.duration = parseInt(duration || '7');
        installmentData.start_date = startDate;
        installmentData.store_id = installment.store_id || '1';
        installmentData.advance_payment = advancePayment;
        // Calculate initial payment_due_date as start_date + paymentPeriod - 1
        const startDateObj = new Date(startDate);
        const paymentDueDate = new Date(startDateObj);
        paymentDueDate.setDate(startDateObj.getDate() + parseInt(paymentPeriod || '10') - 1);
        installmentData.payment_due_date = format(paymentDueDate, 'yyyy-MM-dd');
      }
      // Call API to update installment
      const { error } = await updateInstallment(installmentId, installmentData);
      
      if (error) throw error;
      
      // Success - close modal and notify parent
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating installment:', err);
      setError('Có lỗi xảy ra khi cập nhật hợp đồng. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isLoadingData) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-center">Cập nhật hợp đồng trả góp</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center p-8">
            <Spinner className="h-8 w-8" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-[400px] sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Cập nhật hợp đồng trả góp</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Customer information */}
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="customerName" className="text-left sm:text-right font-medium">
              Tên khách hàng <span className="text-red-500">*</span>
            </Label>
            <select 
              className="border rounded-md p-2 w-full"
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              required
              disabled={hasPayments}
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
            <Label htmlFor="contractCode" className="text-left sm:text-right font-medium">Mã HĐ
            </Label>
            <Input 
              id="contractCode"
              value={contractCode}
              onChange={(e) => setContractCode(e.target.value)}
              placeholder=""
              disabled={hasPayments}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="idNumber" className="text-left sm:text-right font-medium">Số CCCD/Hộ chiếu
            </Label>
            <Input 
              id="idNumber"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder=""
              disabled={hasPayments}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="phone" className="text-left sm:text-right font-medium">SĐT
            </Label>
            <Input 
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder=""
              disabled={hasPayments}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-start">
            <Label htmlFor="address" className="text-left sm:text-right font-medium sm:mt-2">Địa chỉ
            </Label>
            <Textarea 
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder=""
              disabled={hasPayments}
            />
          </div>
          
          <div className="flex flex-col sm:grid sm:grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-2 sm:gap-4 sm:items-center">
            <Label htmlFor="amountGiven" className="text-left sm:text-right font-medium">
              Trả góp <span className="text-red-500">*</span>
            </Label>
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
              <MoneyInput 
                id="amountGiven"
                value={amountGiven}
                onChange={handleAmountChange}
                required
                className="w-full sm:w-48"
                placeholder="0"
                disabled={hasPayments}
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
                required
                className="w-full sm:w-48"
                placeholder="0"
                disabled={hasPayments}
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
                  disabled={hasPayments}
                  min={0}
                />
                <span className="text-sm">ngày</span>
              </div>
              <span className="text-xs sm:text-sm text-gray-500 break-words">
                {`Thanh toán ${formatNumber(Math.round(parseInt(amountGiven || '0') / (parseInt(duration || '50') || 1)))} / 1 ngày`}
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
              disabled={hasPayments}
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
              disabled={isLoading || status === "CLOSED" || status === "DELETED"}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto px-6"
            >
              {isLoading ? <Spinner className="mr-2" /> : null}
              Cập nhật
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

      </DialogContent>
    </Dialog>
  );
}
