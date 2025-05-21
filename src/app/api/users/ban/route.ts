import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { userId, action } = await request.json();
    
    if (!userId || !['ban', 'unban'].includes(action)) {
      return NextResponse.json(
        { error: 'UserID và action (ban/unban) là bắt buộc' },
        { status: 400 }
      );
    }

    // Tạo Supabase client với Service Role Key để có quyền admin
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Service Role Key chưa được cấu hình' },
        { status: 500 }
      );
    }

    // Tạo Supabase client với cookie để kiểm tra quyền của người dùng hiện tại
    const supabaseClient = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập' },
        { status: 401 }
      );
    }
    
    // Kiểm tra quyền admin
    const { data: userProfile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Chỉ admin mới có quyền thực hiện hành động này' },
        { status: 403 }
      );
    }

    // Tạo Supabase admin client
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Ban hoặc unban user trên Supabase Auth
    if (action === 'ban') {
      // Ban user trên auth.users
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        banned: true,
        ban_duration: '87600h' // 10 năm (coi như vĩnh viễn)
      });

      // Cập nhật trạng thái bị ban trong profiles
      await supabaseAdmin
        .from('profiles')
        .update({ is_banned: true })
        .eq('id', userId);

      return NextResponse.json({ message: 'Tài khoản đã bị vô hiệu hóa' });
    } else {
      // Unban user trên auth.users
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        banned: false,
        ban_duration: '0'
      });

      // Cập nhật trạng thái bị ban trong profiles
      await supabaseAdmin
        .from('profiles')
        .update({ is_banned: false })
        .eq('id', userId);

      return NextResponse.json({ message: 'Tài khoản đã được kích hoạt lại' });
    }
  } catch (error: any) {
    console.error('Error in ban/unban user:', error);
    return NextResponse.json(
      { error: error.message || 'Đã có lỗi xảy ra' },
      { status: 500 }
    );
  }
} 