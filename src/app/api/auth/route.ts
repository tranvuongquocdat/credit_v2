import { supabase } from '@/lib/supabase';
import { buildAuthEmail } from '@/lib/auth-email';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { username, password, action, role } = await request.json();

    if (action === 'signup') {
      const email = buildAuthEmail(username);
      const { data, error } = await supabase.auth.signUp({ email, password });
      // Nếu đăng ký thành công, lưu username vào bảng profiles
      if (data && data.user) {
        // Tự động xác nhận người dùng nếu cần
        if (!data.session) {
          const { error: confirmError } = await supabase.auth.admin.updateUserById(data.user.id, { email_confirm: true });
          if (confirmError) {
            console.error('Error confirming user:', confirmError);
          }
        }
        const { error: profileError } = await supabase.from('profiles').insert([
          { id: data.user.id, username, role: role || 'user' }
        ]);
        if (profileError) {
          console.error('Error saving username:', profileError);
        }
      }
      if (error) throw error;
      return NextResponse.json({ data });
    } else if (action === 'signin') {
      const { data, error } = await supabase.auth.signInWithPassword({ email: buildAuthEmail(username), password });
      if (error) throw error;
      return NextResponse.json({ data });
    } else if (action === 'signout') {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return NextResponse.json({ message: 'Đăng xuất thành công' });
    } else {
      return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Đã có lỗi xảy ra' }, { status: 500 });
  }
}
