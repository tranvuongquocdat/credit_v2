import { supabase } from '@/lib/supabase';
import { buildAuthEmail } from '@/lib/auth-email';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { username, password, action } = await request.json();

    if (action === 'signin') {
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
