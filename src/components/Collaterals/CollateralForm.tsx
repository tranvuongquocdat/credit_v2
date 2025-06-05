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
import { createCollateral, updateCollateral, checkCollateralCodeExists, getCollaterals } from '@/lib/collateral';
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
  const [availableCollaterals, setAvailableCollaterals] = useState<Collateral[]>([]);
  const [selectedCollateralTemplate, setSelectedCollateralTemplate] = useState<Collateral | null>(null);
  
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

  // Collateral detail attributes based on selected template
  const [collateralDetails, setCollateralDetails] = useState({
    attr_01_value: '',
    attr_02_value: '',
    attr_03_value: '',
    attr_04_value: '',
    attr_05_value: ''
  });

  // Load available collaterals for template selection
  useEffect(() => {
    if (isOpen && !collateral) {
      loadAvailableCollaterals();
    }
  }, [isOpen, collateral]);

  const loadAvailableCollaterals = async () => {
    try {
      const { data } = await getCollaterals({
        storeId: storeId,
        status: CollateralStatus.ACTIVE
      });
      setAvailableCollaterals(data || []);
    } catch (error) {
      console.error('Error loading collaterals:', error);
    }
  };

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
        setSelectedCollateralTemplate(null);
        setCollateralDetails({
          attr_01_value: '',
          attr_02_value: '',
          attr_03_value: '',
          attr_04_value: '',
          attr_05_value: ''
        });
      }
    }
  }, [isOpen, collateral]);

  // Handle collateral template selection
  const handleCollateralTemplateChange = (collateralId: string) => {
    if (collateralId === "none") {
      setSelectedCollateralTemplate(null);
      // Reset form to defaults when no template selected
      setFormData(prev => ({
        ...prev,
        category: CollateralCategory.PAWN,
        name: '',
        default_amount: 0,
        interest_per_day: 3,
        interest_type: InterestType.PER_MILLION,
        interest_period: 10,
        prepay_interest: false,
        liquidation_after: 5
      }));
      
      setCollateralDetails({
        attr_01_value: '',
        attr_02_value: '',
        attr_03_value: '',
        attr_04_value: '',
        attr_05_value: ''
      });
      return;
    }
    
    const selected = availableCollaterals.find(c => c.id === collateralId);
    if (selected) {
      setSelectedCollateralTemplate(selected);
      // Auto-fill form with template data
      setFormData(prev => ({
        ...prev,
        category: selected.category as any,
        name: selected.name, // Điền tên template
        default_amount: selected.default_amount,
        interest_per_day: selected.interest_per_day,
        interest_type: selected.interest_type as any,
        interest_period: selected.interest_period,
        prepay_interest: selected.prepay_interest || false,
        liquidation_after: selected.liquidation_after || 5
      }));
      
      // Reset collateral details when changing template
      setCollateralDetails({
        attr_01_value: '',
        attr_02_value: '',
        attr_03_value: '',
        attr_04_value: '',
        attr_05_value: ''
      });
    }
  };

  // Generate collateral detail string from attributes
  const generateCollateralDetail = () => {
    const template = selectedCollateralTemplate || collateral;
    if (!template) return '';

    const details: string[] = [];
    
    if (template.attr_01 && collateralDetails.attr_01_value) {
      details.push(`${template.attr_01}: ${collateralDetails.attr_01_value}`);
    }
    if (template.attr_02 && collateralDetails.attr_02_value) {
      details.push(`${template.attr_02}: ${collateralDetails.attr_02_value}`);
    }
    if (template.attr_03 && collateralDetails.attr_03_value) {
      details.push(`${template.attr_03}: ${collateralDetails.attr_03_value}`);
    }
    if (template.attr_04 && collateralDetails.attr_04_value) {
      details.push(`${template.attr_04}: ${collateralDetails.attr_04_value}`);
    }
    if (template.attr_05 && collateralDetails.attr_05_value) {
      details.push(`${template.attr_05}: ${collateralDetails.attr_05_value}`);
    }

    return details.join(', ');
  };

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

      // Generate collateral detail from attributes
      const collateralDetail = generateCollateralDetail();

      if (collateral) {
        // Update existing collateral
        const updateData: CollateralUpdate = {
          ...formData,
          store_id: storeId,
          // Don't update collateral_detail for template editing
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
        // Create new collateral instance based on template
        if (selectedCollateralTemplate) {
          // Creating instance from template
          const instanceName = collateralDetail 
            ? `${selectedCollateralTemplate.name} (${collateralDetail})`
            : `${selectedCollateralTemplate.name} - ${formData.code}`;

          const insertData: CollateralInsert = {
            category: formData.category,
            name: instanceName,
            code: formData.code,
            status: formData.status,
            default_amount: formData.default_amount,
            interest_per_day: formData.interest_per_day,
            interest_type: formData.interest_type,
            interest_period: formData.interest_period,
            prepay_interest: formData.prepay_interest,
            liquidation_after: formData.liquidation_after,
            attr_01: selectedCollateralTemplate.attr_01,
            attr_02: selectedCollateralTemplate.attr_02,
            attr_03: selectedCollateralTemplate.attr_03,
            attr_04: selectedCollateralTemplate.attr_04,
            attr_05: selectedCollateralTemplate.attr_05,
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
            description: "Đã tạo tài sản thế chấp mới từ template"
          });
        } else {
          // Create new template
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
            description: "Đã tạo template tài sản thế chấp mới"
          });
        }
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
          {/* Chọn template tài sản (chỉ hiển thị khi tạo mới) */}
          {!collateral && (
            <div className="border-b pb-4 mb-4">
              <Label htmlFor="collateral_template" className="mb-2 block">Chọn loại tài sản thế chấp</Label>
              <Select 
                value={selectedCollateralTemplate?.id || 'none'} 
                onValueChange={handleCollateralTemplateChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại tài sản để tự động điền thông tin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không chọn template</SelectItem>
                  {availableCollaterals.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.code}) - {template.interest_per_day}{template.interest_type === 'per_million' ? 'k/1tr' : 'đ'}/{template.interest_period} ngày
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Hiển thị thông tin template được chọn */}
              {selectedCollateralTemplate && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Thông tin template được chọn:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm text-blue-800">
                    <div>Lĩnh vực: <span className="font-medium">{selectedCollateralTemplate.category === 'pawn' ? 'Cầm đồ' : 'Tín chấp'}</span></div>
                    <div>Số tiền mặc định: <span className="font-medium">{selectedCollateralTemplate.default_amount.toLocaleString('vi-VN')}đ</span></div>
                    <div>Lãi phí: <span className="font-medium">{selectedCollateralTemplate.interest_per_day}{selectedCollateralTemplate.interest_type === 'per_million' ? 'k/1 triệu' : 'đ'}</span></div>
                    <div>Kỳ lãi phí: <span className="font-medium">{selectedCollateralTemplate.interest_period} ngày</span></div>
                    <div>Thu lãi trước: <span className="font-medium">{selectedCollateralTemplate.prepay_interest ? 'Có' : 'Không'}</span></div>
                    <div>Thanh lý sau: <span className="font-medium">{selectedCollateralTemplate.liquidation_after || 5} ngày</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lĩnh vực */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category" className="mb-2 block">Lĩnh vực *</Label>
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
              <Label htmlFor="status" className="mb-2 block">Trạng thái</Label>
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
              <Label htmlFor="name" className="mb-2 block">Tên hàng hóa *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nhập tên hàng hóa"
                className={selectedCollateralTemplate ? "bg-blue-50 border-blue-200" : ""}
              />
              {selectedCollateralTemplate && (
                <div className="text-xs text-blue-600 mt-1">
                  📋 Điền từ template: {selectedCollateralTemplate.name}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="code" className="mb-2 block">Mã hàng *</Label>
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
                <Label htmlFor="default_amount" className="mb-2 block">Số tiền cầm *</Label>
                <Input
                  id="default_amount"
                  type="number"
                  value={formData.default_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, default_amount: Number(e.target.value) }))}
                  placeholder="Nhập số tiền"
                  className={selectedCollateralTemplate ? "bg-blue-50 border-blue-200" : ""}
                />
                {selectedCollateralTemplate && (
                  <div className="text-xs text-blue-600 mt-1">
                    📋 Từ template: {selectedCollateralTemplate.default_amount.toLocaleString('vi-VN')}đ
                  </div>
                )}
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
                <Label htmlFor="interest_per_day" className="mb-2 block">Lãi phí ngày *</Label>
                <Input
                  id="interest_per_day"
                  type="number"
                  step="0.01"
                  value={formData.interest_per_day}
                  onChange={(e) => setFormData(prev => ({ ...prev, interest_per_day: Number(e.target.value) }))}
                  placeholder="Nhập lãi phí"
                  className={selectedCollateralTemplate ? "bg-blue-50 border-blue-200" : ""}
                />
                {selectedCollateralTemplate && (
                  <div className="text-xs text-blue-600 mt-1">
                    📋 Từ template: {selectedCollateralTemplate.interest_per_day}{selectedCollateralTemplate.interest_type === 'per_million' ? 'k/1 triệu' : 'đ'}
                  </div>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Loại lãi phí</Label>
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
                <Label htmlFor="interest_period" className="mb-2 block">Kỳ lãi phí *</Label>
                <Input
                  id="interest_period"
                  type="number"
                  value={formData.interest_period}
                  onChange={(e) => setFormData(prev => ({ ...prev, interest_period: Number(e.target.value) }))}
                  placeholder="Nhập số ngày"
                  className={selectedCollateralTemplate ? "bg-blue-50 border-blue-200" : ""}
                />
                {selectedCollateralTemplate ? (
                  <div className="text-xs text-blue-600 mt-1">
                    📋 Từ template: {selectedCollateralTemplate.interest_period} ngày
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 mt-1">ngày quá hạn</div>
                )}
              </div>
              <div>
                <Label htmlFor="liquidation_after" className="mb-2 block">Thanh lý sau</Label>
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

          {/* Chi tiết tài sản thế chấp dựa trên template */}
          {(selectedCollateralTemplate || collateral) && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-medium text-red-600 mb-4">
                Chi tiết tài sản thế chấp
                {selectedCollateralTemplate && (
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    ({selectedCollateralTemplate.name})
                  </span>
                )}
              </h3>
              
              <div className="space-y-3">
                {/* Hiển thị các ô input dựa trên thuộc tính của template */}
                {(selectedCollateralTemplate?.attr_01 || collateral?.attr_01) && (
                  <div>
                    <Label htmlFor="attr_01_value">
                      {selectedCollateralTemplate?.attr_01 || collateral?.attr_01}
                    </Label>
                    <Input
                      id="attr_01_value"
                      value={collateralDetails.attr_01_value}
                      onChange={(e) => setCollateralDetails(prev => ({ ...prev, attr_01_value: e.target.value }))}
                      placeholder={`Nhập ${selectedCollateralTemplate?.attr_01 || collateral?.attr_01}`}
                    />
                  </div>
                )}
                
                {(selectedCollateralTemplate?.attr_02 || collateral?.attr_02) && (
                  <div>
                    <Label htmlFor="attr_02_value">
                      {selectedCollateralTemplate?.attr_02 || collateral?.attr_02}
                    </Label>
                    <Input
                      id="attr_02_value"
                      value={collateralDetails.attr_02_value}
                      onChange={(e) => setCollateralDetails(prev => ({ ...prev, attr_02_value: e.target.value }))}
                      placeholder={`Nhập ${selectedCollateralTemplate?.attr_02 || collateral?.attr_02}`}
                    />
                  </div>
                )}
                
                {(selectedCollateralTemplate?.attr_03 || collateral?.attr_03) && (
                  <div>
                    <Label htmlFor="attr_03_value">
                      {selectedCollateralTemplate?.attr_03 || collateral?.attr_03}
                    </Label>
                    <Input
                      id="attr_03_value"
                      value={collateralDetails.attr_03_value}
                      onChange={(e) => setCollateralDetails(prev => ({ ...prev, attr_03_value: e.target.value }))}
                      placeholder={`Nhập ${selectedCollateralTemplate?.attr_03 || collateral?.attr_03}`}
                    />
                  </div>
                )}
                
                {(selectedCollateralTemplate?.attr_04 || collateral?.attr_04) && (
                  <div>
                    <Label htmlFor="attr_04_value">
                      {selectedCollateralTemplate?.attr_04 || collateral?.attr_04}
                    </Label>
                    <Input
                      id="attr_04_value"
                      value={collateralDetails.attr_04_value}
                      onChange={(e) => setCollateralDetails(prev => ({ ...prev, attr_04_value: e.target.value }))}
                      placeholder={`Nhập ${selectedCollateralTemplate?.attr_04 || collateral?.attr_04}`}
                    />
                  </div>
                )}
                
                {(selectedCollateralTemplate?.attr_05 || collateral?.attr_05) && (
                  <div>
                    <Label htmlFor="attr_05_value">
                      {selectedCollateralTemplate?.attr_05 || collateral?.attr_05}
                    </Label>
                    <Input
                      id="attr_05_value"
                      value={collateralDetails.attr_05_value}
                      onChange={(e) => setCollateralDetails(prev => ({ ...prev, attr_05_value: e.target.value }))}
                      placeholder={`Nhập ${selectedCollateralTemplate?.attr_05 || collateral?.attr_05}`}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cấu hình thuộc tính hàng hóa (chỉ hiển thị khi chỉnh sửa template) */}
          {collateral && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-medium text-red-600 mb-4">Cấu hình thuộc tính hàng hóa</h3>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="attr_01" className="mb-2 block">Thuộc tính 01</Label>
                  <Input
                    id="attr_01"
                    value={formData.attr_01}
                    onChange={(e) => setFormData(prev => ({ ...prev, attr_01: e.target.value }))}
                    placeholder="Biển kiểm soát"
                  />
                </div>
                <div>
                  <Label htmlFor="attr_02" className="mb-2 block">Thuộc tính 02</Label>
                  <Input
                    id="attr_02"
                    value={formData.attr_02}
                    onChange={(e) => setFormData(prev => ({ ...prev, attr_02: e.target.value }))}
                    placeholder="Hãng"
                  />
                </div>
                <div>
                  <Label htmlFor="attr_03" className="mb-2 block">Thuộc tính 03</Label>
                  <Input
                    id="attr_03"
                    value={formData.attr_03}
                    onChange={(e) => setFormData(prev => ({ ...prev, attr_03: e.target.value }))}
                    placeholder="Màu"
                  />
                </div>
                <div>
                  <Label htmlFor="attr_04" className="mb-2 block">Thuộc tính 04</Label>
                  <Input
                    id="attr_04"
                    value={formData.attr_04}
                    onChange={(e) => setFormData(prev => ({ ...prev, attr_04: e.target.value }))}
                    placeholder="Thuộc tính 04"
                  />
                </div>
                <div>
                  <Label htmlFor="attr_05" className="mb-2 block">Thuộc tính 05</Label>
                  <Input
                    id="attr_05"
                    value={formData.attr_05}
                    onChange={(e) => setFormData(prev => ({ ...prev, attr_05: e.target.value }))}
                    placeholder="Thuộc tính 05"
                  />
                </div>
              </div>
            </div>
          )}

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