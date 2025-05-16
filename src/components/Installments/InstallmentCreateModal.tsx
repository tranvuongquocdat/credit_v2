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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle } from 'lucide-react';
import { createInstallment } from '@/lib/installment';
import { getCustomers } from '@/lib/customer';
import { getEmployees } from '@/lib/employee';
import { Customer } from '@/models/customer';
import { Employee } from '@/models/employee';
import { InstallmentStatus } from '@/models/installment';
import Spinner from '@/components/ui/spinner';

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
  // State for form values
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [customerName, setCustomerName] = useState('');
  const [contractCode, setContractCode] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [amountGiven, setAmountGiven] = useState<string>('0');
  const [interestRate, setInterestRate] = useState<string>('10');
  const [duration, setDuration] = useState<string>('7');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [advancePayment, setAdvancePayment] = useState(false);
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
  
  // Quick buttons for amount adjustments
  const amountPresets = [1, 2, 3, 5, 10, 15, 20];

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
        
        // Load employees
        const { data: employeesData, error: employeesError } = await getEmployees(1, 1000);
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
  
  // Quick amount adjustment
  const adjustAmount = (amount: number) => {
    const newAmount = parseInt(amountGiven || '0') + amount;
    setAmountGiven(newAmount > 0 ? newAmount.toString() : '0');
  };
  
  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Prepare installment data
      const installmentData = {
        customer_id: customerType === 'existing' ? selectedCustomerId : '',
        customer_name: customerType === 'new' ? customerName : '',
        contract_code: contractCode,
        id_number: idNumber,
        phone,
        address,
        amount_given: parseInt(amountGiven || '0'),
        interest_rate: parseFloat(interestRate || '0'),
        duration: parseInt(duration || '7'),
        start_date: new Date(startDate),
        notes,
        status: InstallmentStatus.ON_TIME,
        amount_paid: 0,
        store_id: '1', // Default store ID
        employee_id: employeeId,
        advance_payment: advancePayment
      };
      
      // Call API to create installment
      const { error } = await createInstallment(installmentData);
      
      if (error) throw error;
      
      // Success - close modal and notify parent
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error creating installment:', err);
      setError('Có lỗi xảy ra khi tạo hợp đồng. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="amountGiven" className="text-right">
              Trả góp <span className="text-red-500">*</span>
            </Label>
            <div>
              <Input 
                id="amountGiven"
                type="number"
                value={amountGiven}
                onChange={(e) => setAmountGiven(e.target.value)}
                required
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {amountPresets.map(amount => (
                  <Button 
                    key={amount}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => adjustAmount(amount * 1000000)}
                    className="px-2 py-1 h-auto"
                  >
                    {amount}tr
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="tiendua" className="text-right">
              Tiền đưa khách <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="tiendua"
              type="number"
              value={amountGiven}
              onChange={(e) => setAmountGiven(e.target.value)}
              required
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="duration" className="text-right">
              Thời gian vay <span className="text-red-500">*</span>
            </Label>
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
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="interestRate" className="text-right">
              Số ngày đóng tiền <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input 
                id="interestRate"
                type="number"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                required
                className="w-24"
              />
              <span>ngày</span>
            </div>
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="startDate" className="text-right">Ngày vay</Label>
            <Input 
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
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
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="advancePayment" className="text-right">Thu tiền trước</Label>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="advancePayment"
                checked={advancePayment}
                onChange={(e) => setAdvancePayment(e.target.checked)}
                className="mr-2 h-4 w-4"
              />
              <Label htmlFor="advancePayment" className="text-sm font-normal">
                Đánh dấu nếu thu tiền trước
              </Label>
            </div>
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
