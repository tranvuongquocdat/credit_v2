'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { CollateralInsert, CollateralUpdate, Collateral, CollateralCategory, CollateralStatus, InterestType } from '@/models/collateral';
import { createCollateral, updateCollateral, checkCollateralCodeExists } from '@/lib/collateral';
import { useToast } from '@/components/ui/use-toast';

interface CollateralFormProps {
  isOpen: boolean;
  onClose: () => void;
  collateral?: Collateral | null;
  storeId: string;
  onSuccess: () => void;
}

export function CollateralForm({ 
  isOpen, 
  onClose, 
  collateral, 
  storeId,
  onSuccess 
}: CollateralFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    category: CollateralCategory.PAWN,
    name: '',
    code: '',
    status: CollateralStatus.ACTIVE,
    default_amount: 0,
    interest_per_day: 0,
    interest_type: InterestType.PER_MILLION,
    interest_period: 10,
    prepay_interest: false,
    liquidation_after: 5,
    attr_01: '', // Biển kiểm soát
    attr_02: '', // Hãng
    attr_03: '', // Màu
    attr_04: '',
    attr_05: ''
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      if (collateral) {
        // Edit mode
        setFormData({
          category: collateral.category as any,
          name: collateral.name,
          code: collateral.code,
          status: collateral.status as any,
          default_amount: collateral.default_amount,
          interest_per_day: collateral.interest_per_day,
          interest_type: collateral.interest_type as any,
          interest_period: collateral.interest_period,
          prepay_interest: collateral.prepay_interest || false,
          liquidation_after: collateral.liquidation_after || 5,
          attr_01: collateral.attr_01 || '',
          attr_02: collateral.attr_02 || '',
          attr_03: collateral.attr_03 || '',
          attr_04: collateral.attr_04 || '',
          attr_05: collateral.attr_05 || ''
        });
      } else {
        // Create mode - reset to defaults
        setFormData({
          category: CollateralCategory.PAWN,
          name: '',
          code: '',
          status: CollateralStatus.ACTIVE,
          default_amount: 0,
          interest_per_day: 3,
          interest_type: InterestType.PER_MILLION,
          interest_period: 10,
          prepay_interest: false,
          liquidation_after: 5,
          attr_01: '',
          attr_02: '',
          attr_03: '',
          attr_04: '',
          attr_05: ''
        });
      }
    }
  }, [isOpen, collateral]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        toast({
          title: "Lỗi",
          description: "Vui lòng nhập tên hàng hóa",
          variant: "destructive"
        });
        return;
      }

      if (!formData.code.trim()) {
        toast({
          title: "Lỗi",
          description: "Vui lòng nhập mã hàng",
          variant: "destructive"
        });
        return;
      }

      // Check if code exists (for create or when code changed in edit)
      if (!collateral || formData.code !== collateral.code) {
        const { exists, error: checkError } = await checkCollateralCodeExists(
          formData.code, 
          collateral?.id
        );
        
        if (checkError) {
          toast({
            title: "Lỗi",
            description: "Không thể kiểm tra mã hàng",
            variant: "destructive"
          });
          return;
        }

        if (exists) {
          toast({
            title: "Lỗi",
            description: "Mã hàng đã tồn tại",
            variant: "destructive"
          });
          return;
        }
      }

      if (collateral) {
        // Update existing collateral
        const updateData: CollateralUpdate = {
          ...formData,
          store_id: storeId
        };

        const { error } = await updateCollateral(collateral.id, updateData);
        
        if (error) {
          toast({
            title: "Lỗi",
            description: "Không thể cập nhật tài sản thế chấp",
            variant: "destructive"
          });
          return;
        }

        toast({
          title: "Thành công",
          description: "Đã cập nhật tài sản thế chấp"
        });
      } else {
        // Create new collateral
        const insertData: CollateralInsert = {
          ...formData,
          store_id: storeId
        };

        const { error } = await createCollateral(insertData);
        
        if (error) {
          toast({
            title: "Lỗi",
            description: "Không thể tạo tài sản thế chấp",
            variant: "destructive"
          });
          return;
        }

        toast({
          title: "Thành công",
          description: "Đã tạo tài sản thế chấp mới"
        });
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving collateral:', error);
      toast({
        title: "Lỗi",
        description: "Có lỗi xảy ra khi lưu dữ liệu",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {collateral ? 'Chỉnh sửa tài sản thế chấp' : 'Thêm tài sản thế chấp'}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lĩnh vực */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Lĩnh vực *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lĩnh vực" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CollateralCategory.PAWN}>Cầm đồ</SelectItem>
                  <SelectItem value={CollateralCategory.UNSECURED}>Tín chấp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trạng thái */}
            <div>
              <Label htmlFor="status">Trạng thái</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CollateralStatus.ACTIVE}>Hoạt động</SelectItem>
                  <SelectItem value={CollateralStatus.INACTIVE}>Không hoạt động</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tên hàng hóa và Mã hàng */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Tên hàng hóa *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nhập tên hàng hóa"
              />
            </div>
            <div>
              <Label htmlFor="code">Mã hàng *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                placeholder="Nhập mã hàng"
              />
            </div>
          </div>

          {/* Cấu hình giá trị mặc định */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-medium text-red-600 mb-4">Cấu hình giá trị mặc định</h3>
            
            {/* Số tiền cầm */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="default_amount">Số tiền cầm *</Label>
                <Input
                  id="default_amount"
                  type="number"
                  value={formData.default_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, default_amount: Number(e.target.value) }))}
                  placeholder="Nhập số tiền"
                />
              </div>
              <div className="flex items-center space-x-2 mt-6">
                <Checkbox 
                  id="prepay_interest"
                  checked={formData.prepay_interest}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, prepay_interest: checked as boolean }))}
                />
                <Label htmlFor="prepay_interest">Thu lãi phí trước</Label>
              </div>
            </div>

            {/* Lãi phí ngày và loại */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="interest_per_day">Lãi phí ngày *</Label>
                <Input
                  id="interest_per_day"
                  type="number"
                  step="0.01"
                  value={formData.interest_per_day}
                  onChange={(e) => setFormData(prev => ({ ...prev, interest_per_day: Number(e.target.value) }))}
                  placeholder="Nhập lãi phí"
                />
              </div>
              <div>
                <Label>Loại lãi phí</Label>
                <RadioGroup 
                  value={formData.interest_type} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, interest_type: value as any }))}
                  className="flex space-x-4 mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={InterestType.PER_MILLION} id="per_million" />
                    <Label htmlFor="per_million">k/1 triệu</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value={InterestType.TOTAL} id="total" />
                    <Label htmlFor="total">Tổng tiền</Label>
                  </div>
                </RadioGroup>
                <div className="text-xs text-gray-500 mt-1">
                  (VD : 15 ngày đóng lãi phí 1 lần thì điền số 15 )
                </div>
              </div>
            </div>

            {/* Kỳ lãi phí và Thanh lý sau */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="interest_period">Kỳ lãi phí *</Label>
                <Input
                  id="interest_period"
                  type="number"
                  value={formData.interest_period}
                  onChange={(e) => setFormData(prev => ({ ...prev, interest_period: Number(e.target.value) }))}
                  placeholder="Nhập số ngày"
                />
                <div className="text-xs text-gray-500 mt-1">ngày quá hạn</div>
              </div>
              <div>
                <Label htmlFor="liquidation_after">Thanh lý sau</Label>
                <Input
                  id="liquidation_after"
                  type="number"
                  value={formData.liquidation_after}
                  onChange={(e) => setFormData(prev => ({ ...prev, liquidation_after: Number(e.target.value) }))}
                  placeholder="Nhập số ngày"
                />
              </div>
            </div>
          </div>

          {/* Cấu hình thuộc tính hàng hóa */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-medium text-red-600 mb-4">Cấu hình thuộc tính hàng hóa</h3>
            
            <div className="space-y-3">
              <div>
                <Label htmlFor="attr_01">Thuộc tính 01</Label>
                <Input
                  id="attr_01"
                  value={formData.attr_01}
                  onChange={(e) => setFormData(prev => ({ ...prev, attr_01: e.target.value }))}
                  placeholder="Biển kiểm soát"
                />
              </div>
              <div>
                <Label htmlFor="attr_02">Thuộc tính 02</Label>
                <Input
                  id="attr_02"
                  value={formData.attr_02}
                  onChange={(e) => setFormData(prev => ({ ...prev, attr_02: e.target.value }))}
                  placeholder="Hãng"
                />
              </div>
              <div>
                <Label htmlFor="attr_03">Thuộc tính 03</Label>
                <Input
                  id="attr_03"
                  value={formData.attr_03}
                  onChange={(e) => setFormData(prev => ({ ...prev, attr_03: e.target.value }))}
                  placeholder="Màu"
                />
              </div>
              <div>
                <Label htmlFor="attr_04">Thuộc tính 04</Label>
                <Input
                  id="attr_04"
                  value={formData.attr_04}
                  onChange={(e) => setFormData(prev => ({ ...prev, attr_04: e.target.value }))}
                  placeholder="Thuộc tính 04"
                />
              </div>
              <div>
                <Label htmlFor="attr_05">Thuộc tính 05</Label>
                <Input
                  id="attr_05"
                  value={formData.attr_05}
                  onChange={(e) => setFormData(prev => ({ ...prev, attr_05: e.target.value }))}
                  placeholder="Thuộc tính 05"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Thoát
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Cập nhật'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 