import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    if (!password) {
      return NextResponse.json({ error: 'Thiếu mật khẩu' }, { status: 400 });
    }

    // Lấy hash hiện tại
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'delete_password_hash')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ok = await bcrypt.compare(password, data.value);
    if (!ok) {
      return NextResponse.json({ error: 'Sai mật khẩu xoá' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
} 