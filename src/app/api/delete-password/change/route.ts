import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function PUT(request: Request) {
  try {
    const { oldPassword, newPassword } = await request.json();
    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: 'Thiếu dữ liệu' }, { status: 400 });
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

    const ok = await bcrypt.compare(oldPassword, data.value);
    if (!ok) {
      return NextResponse.json({ error: 'Mật khẩu cũ không đúng' }, { status: 401 });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabaseAdmin
      .from('system_settings')
      .update({ value: newHash, updated_at: new Date().toISOString() })
      .eq('key', 'delete_password_hash');

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
} 