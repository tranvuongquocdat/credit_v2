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
  return { error };
}

// Lấy thông tin người dùng hiện tại
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  console.log(user);
  // Lấy username từ bảng profiles nếu user tồn tại
  let username = null;
  let role = 'user';
  if (user) {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('id', user.id)
      .single();
    if (!error && profileData) {
      username = profileData.username;
      role = profileData.role || 'user';
    }
  }
  
  return { ...user, username, role };
}
