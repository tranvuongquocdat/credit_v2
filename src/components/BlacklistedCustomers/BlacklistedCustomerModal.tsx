'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
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
import { getCustomers, createCustomer, updateCustomer } from '@/lib/customer';
import { Customer } from '@/models/customer';
import { AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface BlacklistedCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BlacklistedCustomerModal({
  isOpen,
  onClose,
  onSuccess
}: BlacklistedCustomerModalProps) {
  // Get current store from context
  const { currentStore } = useStore();
  
  // State for form values
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [customerName, setCustomerName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [blacklistReason, setBlacklistReason] = useState('');
  
  // State for customers dropdown
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  
  // State for form submission
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load customers for dropdown (only non-blacklisted customers)
  useEffect(() => {
    if (!isOpen) return;
    
    async function loadCustomers() {
      setIsLoadingCustomers(true);
      try {
        const { data, error } = await getCustomers(
          1, 
          1000, 
          '', // search query
          currentStore?.id || '', // filter by store_id from context
          '' // status filter
        );
        if (error) throw error;
        // Filter out customers that are already blacklisted
        const nonBlacklistedCustomers = (data || []).filter(customer => !customer.blacklist_reason);
        setCustomers(nonBlacklistedCustomers);
      } catch (err) {
        console.error('Error loading customers:', err);
      } finally {
        setIsLoadingCustomers(false);
      }
    }
    
    loadCustomers();
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
  
  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCustomerType('new');
      setCustomerName('');
      setIdNumber('');
      setPhone('');
      setAddress('');
      setBlacklistReason('');
      setSelectedCustomerId('');
      setError(null);
    }
  }, [isOpen]);
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      if (!currentStore?.id) {
        throw new Error('Vui lòng chọn chi nhánh trước khi báo xấu khách hàng');
      }
      
      // Validate required fields
      if (!blacklistReason.trim()) {
        throw new Error('Vui lòng nhập lý do báo xấu');
      }
      
      let finalCustomerId = selectedCustomerId;
      
      if (customerType === 'new') {
        if (!customerName.trim()) {
          throw new Error('Vui lòng nhập tên khách hàng');
        }
        
        // Create new customer with blacklist reason
        const { data: newCustomer, error: customerError } = await createCustomer({
          name: customerName,
          store_id: currentStore.id,
          phone,
          address,
          id_number: idNumber,
          blacklist_reason: blacklistReason
        });
        
        if (customerError) {
          throw new Error(`Không thể tạo khách hàng mới: ${customerError instanceof Error ? customerError.message : JSON.stringify(customerError)}`);
        }
        
        if (!newCustomer?.id) {
          throw new Error('Không thể tạo khách hàng mới');
        }
        
      } else {
        // Update existing customer with blacklist reason
        if (!finalCustomerId) {
          throw new Error('Vui lòng chọn khách hàng');
        }
        
        const { error: updateError } = await updateCustomer(finalCustomerId, {
          blacklist_reason: blacklistReason
        });
        
        if (updateError) {
          throw new Error(`Không thể cập nhật thông tin khách hàng: ${updateError instanceof Error ? updateError.message : JSON.stringify(updateError)}`);
        }
      }
      
      // Show success message
      toast({
        title: 'Thành công',
        description: 'Đã báo xấu khách hàng thành công',
        variant: 'default',
      });
      
      // Call onSuccess callback
      if (onSuccess) {
        onSuccess();
      }
      
      // Close modal
      onClose();
      
    } catch (err) {
      console.error('Error blacklisting customer:', err);
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi báo xấu khách hàng');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-red-600">
            <AlertCircle className="h-6 w-6 inline mr-2" />
            Báo xấu khách hàng
          </DialogTitle>
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
                    {customer.name} {customer.phone ? `- ${customer.phone}` : ''} {customer.id_number ? `- ${customer.id_number}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="idNumber" className="text-right">Số CCCD/CMT</Label>
            <Input 
              id="idNumber"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              disabled={customerType === 'existing'}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-center">
            <Label htmlFor="phone" className="text-right">Số điện thoại</Label>
            <Input 
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={customerType === 'existing'}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
            <Label htmlFor="address" className="text-right mt-2">Địa chỉ</Label>
            <Textarea 
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              disabled={customerType === 'existing'}
            />
          </div>
          
          <div className="grid grid-cols-[120px_1fr] md:grid-cols-[150px_1fr] gap-4 items-start">
            <Label htmlFor="blacklistReason" className="text-right mt-2">
              Lý do báo xấu <span className="text-red-500">*</span>
            </Label>
            <Textarea 
              id="blacklistReason"
              value={blacklistReason}
              onChange={(e) => setBlacklistReason(e.target.value)}
              rows={3}
              placeholder="Nhập lý do báo xấu khách hàng..."
              required
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
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isLoading}
            >
              {isLoading ? 'Đang xử lý...' : 'Báo xấu'}
            </Button>
            <Button 
              type="button" 
              className="bg-gray-200 hover:bg-gray-300 text-gray-800"
              onClick={onClose}
              disabled={isLoading}
            >
              Hủy
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 