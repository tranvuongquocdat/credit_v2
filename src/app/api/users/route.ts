import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    // Tạo Supabase client với cookie để kiểm tra quyền của người dùng hiện tại
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập' },
        { status: 401 }
      );
    }
    
    // Kiểm tra quyền admin
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
      
    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Chỉ admin mới có quyền truy cập dữ liệu này' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role') || '';
    const status = url.searchParams.get('status') || '';
    const order = url.searchParams.get('order') || 'created_at';
    const ascending = url.searchParams.get('ascending') === 'true';

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('profiles')
      .select('id, username, role, is_banned, created_at', { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.ilike('username', `%${search}%`);
    }
    
    if (role) {
      query = query.eq('role', role);
    }
    
    if (status === 'banned') {
      query = query.eq('is_banned', true);
    } else if (status === 'active') {
      query = query.eq('is_banned', false);
    }

    // Apply ordering
    query = query.order(order, { ascending });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data: users, count, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate total pages
    const totalPages = count ? Math.ceil(count / limit) : 0;

    return NextResponse.json({
      users,
      pagination: {
        total: count,
        page,
        limit,
        totalPages
      }
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: error.message || 'Đã có lỗi xảy ra khi lấy danh sách người dùng' },
      { status: 500 }
    );
  }
} 