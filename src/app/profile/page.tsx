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
  X
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

  useEffect(() => {
    if (!authLoading && user) {
      fetchProfile();
    }
  }, [user, authLoading]);

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

              {profile.employee.updated_at && (
                <div className="pt-2 border-t border-gray-200">
                  <Label className="text-sm font-medium text-gray-700">Cập nhật lần cuối</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600 text-sm">
                      {profile.employee.updated_at ? formatDateTime(profile.employee.updated_at) : 'Chưa cập nhật'}
                    </span>
                  </div>
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