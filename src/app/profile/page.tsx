'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/lib/supabase';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  User, 
  Store, 
  Calendar, 
  Phone, 
  Shield, 
  Building, 
  Clock,
  Edit3,
  Save,
  X,
  Key,
  Eye,
  EyeOff,
  CheckCircle
} from 'lucide-react';
interface EmployeeData {
  id: string;
  uid?: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  store_id: string | null;
  store?: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
}

interface UserProfileData {
  id: string;
  username: string;
  email: string;
  role: string;
  is_banned: boolean;
  created_at: string;
  employee?: EmployeeData;
}

export default function ProfilePage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { currentStore } = useStore();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    full_name: '',
    phone: '',
  });
  const [passwordChangeMode, setPasswordChangeMode] = useState(false);
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false,
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Fetch user profile data
  const fetchProfile = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Get basic profile info
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      let employeeData = null;
      
      // If user is employee, get employee details with store info
      if (profileData.role === 'employee') {
        const { data: empData, error: empError } = await supabase
          .from('employees')
          .select(`
            *,
            store:stores (
              id,
              name,
              address,
              phone
            )
          `)
          .eq('user_id', user.id)
          .single();

        if (!empError && empData) {
          employeeData = empData;
        }
      }

      const profileWithEmployee: UserProfileData = {
        id: profileData.id,
        username: profileData.username,
        email: user.email || `${profileData.username}@creditapp.local`,
        role: profileData.role,
        is_banned: profileData.is_banned || false,
        created_at: profileData.created_at,
        employee: employeeData || undefined
      };

      setProfile(profileWithEmployee);
      
      // Set edit data
      setEditData({
        full_name: employeeData?.full_name || '',
        phone: employeeData?.phone || '',
      });

    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải hồ sơ');
    } finally {
      setLoading(false);
    }
  };

  // Update employee information
  const handleUpdateProfile = async () => {
    if (!profile?.employee?.uid) return;

    try {
      setLoading(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('employees')
        .update({
          full_name: editData.full_name,
          phone: editData.phone,
          updated_at: new Date().toISOString()
        })
        .eq('uid', profile.employee.uid);

      if (updateError) throw updateError;

      setEditMode(false);
      await fetchProfile(); // Refresh data

    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi cập nhật hồ sơ');
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditData({
      full_name: profile?.employee?.full_name || '',
      phone: profile?.employee?.phone || '',
    });
  };

  // Handle password change
  const handlePasswordChange = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      setError('Vui lòng nhập đầy đủ thông tin mật khẩu');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    try {
      setPasswordLoading(true);
      setError(null);

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (updateError) throw updateError;

      setPasswordChangeMode(false);
      setPasswordData({
        newPassword: '',
        confirmPassword: '',
      });
      
      // Show success message
      setPasswordSuccess(true);

    } catch (err) {
      console.error('Error updating password:', err);
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi thay đổi mật khẩu');
    } finally {
      setPasswordLoading(false);
    }
  };

  const cancelPasswordChange = () => {
    setPasswordChangeMode(false);
    setPasswordData({
      newPassword: '',
      confirmPassword: '',
    });
    setError(null);
  };

  const togglePasswordVisibility = (field: 'new' | 'confirm') => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchProfile();
    }
  }, [user, authLoading]);

  // Auto-hide password success message after 5 seconds
  useEffect(() => {
    if (passwordSuccess) {
      const timer = setTimeout(() => {
        setPasswordSuccess(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [passwordSuccess]);

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Đang tải hồ sơ...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
            <Button 
              onClick={fetchProfile} 
              className="mt-2 bg-red-600 hover:bg-red-700"
            >
              Thử lại
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="p-4">
          <div className="text-center py-8">
            <p className="text-gray-500">Không thể tải thông tin hồ sơ</p>
          </div>
        </div>
      </Layout>
    );
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'superadmin':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Quyền quản trị hệ thống</Badge>;
      case 'admin':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Quyền quản trị viên</Badge>;
      case 'employee':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Quyền nhân viên</Badge>;
      case 'user':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Người dùng</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Người dùng</Badge>;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'working':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Đang làm việc</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Không hoạt động</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Không xác định</Badge>;
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <User className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Hồ sơ cá nhân</h1>
          </div>
          
          {profile.employee && !editMode && (
            <Button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Edit3 className="h-4 w-4" />
              Chỉnh sửa
            </Button>
          )}
        </div>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Thông tin tài khoản
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Tên đăng nhập</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-900 font-medium">{profile.username}</span>
                  </div>
                </div>
                
                                 <div>
                   <Label className="text-sm font-medium text-gray-700">Cửa hàng</Label>
                   <div className="flex items-center gap-2 mt-1">
                     <Store className="h-4 w-4 text-gray-500" />
                     <span className="text-gray-900">
                       {profile.employee?.store?.name || 
                        (profile.role === 'employee' ? 'Chưa được phân cửa hàng' : 'Không thuộc cửa hàng nào')}
                     </span>
                   </div>
                 </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Vai trò</Label>
                  <div className="mt-1">
                    {getRoleBadge(profile.role)}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700">Ngày tạo tài khoản</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-900">{formatDateTime(profile.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            {profile.is_banned && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 font-medium">⚠️ Tài khoản đã bị khóa</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Employee Information */}
        {profile.employee && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5 text-blue-600" />
                Thông tin nhân viên
                {editMode && (
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleUpdateProfile}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                    >
                      <Save className="h-4 w-4" />
                      Lưu
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                      className="flex items-center gap-1"
                    >
                      <X className="h-4 w-4" />
                      Hủy
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Họ và tên</Label>
                    {editMode ? (
                      <Input
                        value={editData.full_name}
                        onChange={(e) => setEditData(prev => ({ ...prev, full_name: e.target.value }))}
                        className="mt-1"
                        placeholder="Nhập họ và tên"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-900 font-medium">
                          {profile.employee.full_name || 'Chưa cập nhật'}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Số điện thoại</Label>
                    {editMode ? (
                      <Input
                        value={editData.phone}
                        onChange={(e) => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                        className="mt-1"
                        placeholder="Nhập số điện thoại"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <Phone className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-900">
                          {profile.employee.phone || 'Chưa cập nhật'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Trạng thái</Label>
                    <div className="mt-1">
                      {getStatusBadge(profile.employee.status)}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Ngày bắt đầu làm việc</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-900">
                       {profile.employee.created_at ? formatDateTime(profile.employee.created_at) : 'Chưa cập nhật'}
                     </span>
                    </div>
                  </div>
                </div>
              </div>


            </CardContent>
          </Card>
        )}

        {/* Password Change Section - For employees, admins, and superadmins */}
        {(profile.employee || profile.role === 'admin' || profile.role === 'superadmin') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-blue-600" />
                Thay đổi mật khẩu
                                 {!passwordChangeMode && (
                   <Button
                     size="sm"
                     onClick={() => {
                       setPasswordChangeMode(true);
                       setPasswordSuccess(false);
                     }}
                     className="ml-auto bg-blue-600 hover:bg-blue-700"
                   >
                     <Key className="h-4 w-4 mr-1" />
                     Đổi mật khẩu
                   </Button>
                 )}
                {passwordChangeMode && (
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      onClick={handlePasswordChange}
                      disabled={passwordLoading}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                    >
                      <Save className="h-4 w-4" />
                      {passwordLoading ? 'Đang lưu...' : 'Lưu'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelPasswordChange}
                      disabled={passwordLoading}
                      className="flex items-center gap-1"
                    >
                      <X className="h-4 w-4" />
                      Hủy
                    </Button>
                  </div>
                )}
              </CardTitle>
                         </CardHeader>
             <CardContent>
               {passwordSuccess && !passwordChangeMode && (
                 <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                   <div className="flex items-center gap-2 text-green-800">
                     <CheckCircle className="h-5 w-5" />
                     <span className="font-medium">Thành công!</span>
                   </div>
                   <p className="text-green-700 text-sm mt-1">
                     Mật khẩu đã được thay đổi thành công. Thông báo này sẽ tự động ẩn sau 5 giây.
                   </p>
                 </div>
               )}
               
               {passwordChangeMode ? (
                 <div className="space-y-4 max-w-md">
                   <div>
                    <Label className="text-sm font-medium text-gray-700">Mật khẩu mới</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showPasswords.new ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="Nhập mật khẩu mới (ít nhất 6 ký tự)"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('new')}
                      >
                        {showPasswords.new ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Xác nhận mật khẩu mới</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showPasswords.confirm ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Nhập lại mật khẩu mới"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => togglePasswordVisibility('confirm')}
                      >
                        {showPasswords.confirm ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 text-sm text-gray-600">
                    <p>• Mật khẩu phải có ít nhất 6 ký tự</p>
                    <p>• Nên sử dụng kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt</p>
                  </div>
                </div>
              ) : (
                <div className="text-gray-600">
                  <p>Nhấn vào nút "Đổi mật khẩu" để thay đổi mật khẩu đăng nhập của bạn.</p>
                  <p className="text-sm mt-1">Mật khẩu sẽ được cập nhật trong hệ thống xác thực.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Store Information */}
        {profile.employee?.store && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-blue-600" />
                Thông tin cửa hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Tên cửa hàng</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Building className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-900 font-medium">{profile.employee.store.name}</span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Địa chỉ</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Store className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-900">{profile.employee.store.address || 'Chưa cập nhật'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Số điện thoại cửa hàng</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-900">{profile.employee.store.phone || 'Chưa cập nhật'}</span>
                    </div>
                  </div>
                  

                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Role Note */}
        {(profile.role === 'admin' || profile.role === 'superadmin' || profile.role === 'employee') && (
          <Card>
            <CardContent className="pt-6">
              <div className={`flex items-center gap-2 ${
                profile.role === 'superadmin' ? 'text-red-600' : 
                profile.role === 'admin' ? 'text-purple-600' : 
                'text-blue-600'
              }`}>
                <Shield className="h-5 w-5" />
                <span className="font-medium">
                  {profile.role === 'superadmin' ? 'Bạn có quyền quản trị hệ thống' : 
                   profile.role === 'admin' ? 'Bạn có quyền quản trị viên' :
                   'Bạn có quyền nhân viên'}
                </span>
              </div>
              <p className="text-gray-600 text-sm mt-1">
                {profile.role === 'superadmin' 
                  ? 'Với vai trò quản trị hệ thống, bạn có toàn quyền kiểm soát hệ thống và tất cả các chức năng.'
                  : profile.role === 'admin'
                    ? 'Với vai trò quản trị viên, bạn có quyền truy cập vào tất cả các chức năng trong hệ thống.'
                    : 'Với vai trò nhân viên, bạn có quyền truy cập vào cửa hàng của bạn.'
                }
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
} 