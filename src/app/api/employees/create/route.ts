import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      username,
      password,
      full_name,
      email,
      store_id,
      phone,
      status = 'working'
    } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Thiếu username hoặc password' }, { status: 400 });
    }

    // 1. Tạo user auth bằng admin API (không trả session)
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: `${username}@creditapp.local`,
      password,
      email_confirm: true
    });

    if (userError || !userData?.user?.id) {
      throw userError || new Error('Không tạo được user');
    }

    // 2. Thêm profile
    await supabaseAdmin.from('profiles').insert({
      id: userData.user.id,
      username,
      role: 'employee'
    });

    // 3. Thêm employee
    const { data: employeeData, error: empError } = await supabaseAdmin.from('employees').insert({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`,
      user_id: userData.user.id,
      full_name,
      email,
      store_id,
      phone,
      status
    }).select().single();

    if (empError) throw empError;

    return NextResponse.json({ data: employeeData });
  } catch (error: any) {
    console.error('Create employee error:', error);
    return NextResponse.json({ error: error.message || 'Có lỗi xảy ra' }, { status: 500 });
  }
} 