import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

type Params = Promise<{ id: string }>;

export async function GET(
  request: Request,
  { params }: { params: Params }
) {
  try {
    const { id: userId } = await params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'ID người dùng không hợp lệ' },
        { status: 400 }
      );
    }

    // Tạo Supabase client với cookie để kiểm tra quyền của người dùng hiện tại
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập' },
        { status: 401 }
      );
    }
    
    // Kiểm tra quyền: người dùng chỉ có thể xem thông tin của chính họ hoặc admin có thể xem tất cả
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (userId !== user.id && (!userProfile || userProfile.role !== 'admin')) {
      return NextResponse.json(
        { error: 'Không có quyền xem thông tin người dùng này' },
        { status: 403 }
      );
    }

    // Lấy thông tin người dùng từ bảng profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      return NextResponse.json(
        { error: 'Không tìm thấy thông tin người dùng' },
        { status: 404 }
      );
    }

    // Nếu là admin, lấy thêm thông tin từ auth.users (cần Service Role Key)
    let authUserData = null;
    if (userProfile?.role === 'admin') {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      
      if (supabaseServiceKey) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
        
        if (!authError && authUser) {
          authUserData = {
            email: authUser.user.email,
            emailConfirmed: authUser.user.email_confirmed_at,
            lastSignIn: authUser.user.last_sign_in_at,
          };
        }
      }
    }

    return NextResponse.json({
      profile,
      authUserData
    });
  } catch (error: any) {
    console.error('Error fetching user details:', error);
    return NextResponse.json(
      { error: error.message || 'Đã có lỗi xảy ra khi lấy thông tin người dùng' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Params }
) {
  try {
    const { id: userId } = await params;
    const requestData = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'ID người dùng không hợp lệ' },
        { status: 400 }
      );
    }

    // Tạo Supabase client với cookie để kiểm tra quyền của người dùng hiện tại
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập' },
        { status: 401 }
      );
    }
    
    // Kiểm tra quyền: người dùng chỉ có thể cập nhật thông tin của chính họ hoặc admin có thể cập nhật tất cả
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
      
    const isAdmin = userProfile?.role === 'admin';
    
    if (userId !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: 'Không có quyền cập nhật thông tin người dùng này' },
        { status: 403 }
      );
    }

    // Dữ liệu được phép cập nhật tùy thuộc vào quyền
    const updateData: Record<string, any> = {};
    
    // Các trường người dùng thông thường có thể cập nhật
    if (requestData.displayName) {
      updateData.display_name = requestData.displayName;
    }

    // Các trường chỉ admin có thể cập nhật
    if (isAdmin) {
      if (requestData.role) {
        updateData.role = requestData.role;
      }
      
      // Ban/unban là xử lý riêng qua API /api/users/ban
      
      // Cập nhật bảng profiles
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', userId);
          
        if (updateError) {
          throw updateError;
        }
      }
      
      // Nếu admin muốn cập nhật thông tin trong auth.users (email, mật khẩu...)
      if (requestData.email || requestData.password) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        
        if (!supabaseServiceKey) {
          return NextResponse.json(
            { error: 'Service Role Key chưa được cấu hình' },
            { status: 500 }
          );
        }
        
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        
        let authUpdateData: Record<string, any> = {};
        
        if (requestData.email) {
          authUpdateData.email = requestData.email;
          // Tự động xác nhận email mới
          authUpdateData.email_confirm = true;
        }
        
        if (requestData.password) {
          authUpdateData.password = requestData.password;
        }
        
        if (Object.keys(authUpdateData).length > 0) {
          const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            authUpdateData
          );
          
          if (authUpdateError) {
            throw authUpdateError;
          }
        }
      }
    } else {
      // Người dùng thông thường chỉ cập nhật thông tin của họ trong profiles
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', userId);
          
        if (updateError) {
          throw updateError;
        }
      }
    }

    return NextResponse.json({
      message: 'Cập nhật thông tin người dùng thành công'
    });
  } catch (error: any) {
    console.error('Error updating user details:', error);
    return NextResponse.json(
      { error: error.message || 'Đã có lỗi xảy ra khi cập nhật thông tin người dùng' },
      { status: 500 }
    );
  }
} 