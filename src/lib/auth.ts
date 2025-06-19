import { supabase } from './supabase';

// Hàm đăng ký người dùng
export async function signUp(username: string, password: string, role: string = 'user') {
  // Tạo email giả từ username
  const email = `${username}@creditapp.local`;
  const { data, error } = await supabase.auth.signUp({ email, password });
  
  // Nếu đăng ký thành công, lưu username vào bảng profiles
  if (data && data.user) {
    const { error: profileError } = await supabase.from('profiles').insert([
      { id: data.user.id, username, role }
    ]);
    if (profileError) {
      // Nếu có lỗi khi lưu profile, có thể cần xóa user đã tạo
      console.error('Error saving username:', profileError);
    }
  }
  
  return { data, error };
}

// Hàm đăng nhập
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

// Hàm đăng xuất
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  localStorage.removeItem('currentStoreId');
  return { error };
}

// Lấy thông tin người dùng hiện tại
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  // Lấy username từ bảng profiles nếu user tồn tại
  let username = null;
  let role = 'user';
  let is_banned = false;
  if (user) {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('username, role, is_banned')
      .eq('id', user.id)
      .single();
    if (!error && profileData) {
      username = profileData.username;
      role = profileData.role || 'user';
      is_banned = profileData.is_banned || false;
    }
  }
  return { ...user, username, role, is_banned };
}

// Kiểm tra trạng thái ban của người dùng
export async function checkUserBanStatus(userId: string) {
  if (!userId) {
    return { is_banned: false, error: new Error('ID người dùng không hợp lệ') };
  }
  
  try {
    // Kiểm tra trong bảng profiles
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', userId)
      .single();
      
    if (profileError) {
      throw profileError;
    }
    
    return { is_banned: profileData?.is_banned || false, error: null };
  } catch (error) {
    console.error('Error checking ban status:', error);
    return { is_banned: false, error };
  }
}