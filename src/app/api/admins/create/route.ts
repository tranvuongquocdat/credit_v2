import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, email, password, status, createdBySuperadminId } = body || {};

    if (!username || !password) {
      return NextResponse.json({ error: 'Thiếu dữ liệu bắt buộc' }, { status: 400 });
    }

    if (!createdBySuperadminId) {
      return NextResponse.json({ error: 'Thiếu thông tin super admin' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Service Role Key chưa được cấu hình' },
        { status: 500 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Tạo tài khoản auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: `${username}@creditapp.local`,
      password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: authError?.message || 'Không thể tạo tài khoản xác thực' },
        { status: 400 }
      );
    }

    // 2. Thêm bản ghi profile
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authData.user.id,
      username,
      email: email || null,
      role: 'admin',
      created_by_superadmin_id: createdBySuperadminId,
    });

    if (profileError) {
      // rollback auth user?
      // delete auth user to keep consistency (optional)
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: profileError.message || 'Không thể tạo hồ sơ admin' },
        { status: 400 }
      );
    }

    return NextResponse.json({ message: 'Đã tạo admin thành công' });
  } catch (err: any) {
    console.error('Error creating admin:', err);
    return NextResponse.json({ error: err.message || 'Đã có lỗi xảy ra' }, { status: 500 });
  }
} 