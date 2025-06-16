# Hướng dẫn triển khai Permission

## Các bước triển khai Permission cho một page mới

### 1. Import các dependencies cần thiết
```typescript
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
```

### 2. Khai báo permission check trong component
```typescript
const { hasPermission, loading: permissionsLoading } = usePermissions();
const router = useRouter();

// Định nghĩa permission check
const canAccessFeature = hasPermission('your_permission_key');
```

### 3. Thêm useEffect để redirect nếu không có quyền
```typescript
useEffect(() => {
  if (!permissionsLoading && !canAccessFeature) {
    router.push('/');
  }
}, [permissionsLoading, canAccessFeature, router]);
```

### 4. Xử lý các trạng thái loading và access denied
```typescript
// Loading state
if (permissionsLoading) {
  return (
    <Layout>
      <div className="flex items-center justify-center p-4">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        <span>Đang kiểm tra quyền truy cập...</span>
      </div>
    </Layout>
  );
}

// Access denied state
if (!canAccessFeature) {
  return (
    <Layout>
      <div className="p-4 border rounded-md mb-4 bg-gray-50">
        <p className="text-center text-gray-500">
          Bạn không có quyền truy cập chức năng này
        </p>
      </div>
    </Layout>
  );
}
```

### 5. Cấu trúc permission keys
```typescript
const PERMISSIONS = {
  // Store related permissions
  STORE: {
    LIST: 'danh_sach_cua_hang',
    OVERVIEW: 'tong_quat_chuoi_cua_hang',
    DETAIL: 'thong_tin_chi_tiet_cua_hang',
    COLLATERALS: 'cau_hinh_hang_hoa'
  },
  // Add other permission categories as needed
};
```

### 6. Filter menu items trong Sidebar
```typescript
const getFilteredMenuItems = () => {
  if (isLoadingUser || isFiltering) return [];
  
  return menuItems
    .filter(item => !item.superAdminOnly)
    .map(item => {
      if (item.submenu) {
        const filteredSubmenu = item.submenu.filter(subItem => {
          // Check permissions for each submenu item
          if (subItem.path === '/your/path') {
            return hasPermission('your_permission_key');
          }
          return true;
        });
        
        return filteredSubmenu.length > 0 
          ? { ...item, submenu: filteredSubmenu } 
          : null;
      }
      return item;
    })
    .filter(Boolean);
};
```

## Best Practices

1. **Kiểm tra permission sớm**: Luôn kiểm tra permission trước khi render các component phức tạp hoặc gọi API.

2. **Xử lý loading state**: Luôn xử lý trạng thái loading để tránh UI nhấp nháy.

3. **Redirect nhất quán**: Sử dụng hành vi redirect nhất quán cho các trường hợp không có quyền truy cập.

4. **Cache permission**: Cân nhắc cache kết quả permission để tránh kiểm tra không cần thiết.

5. **Xử lý lỗi**: Bao gồm xử lý lỗi phù hợp cho các trường hợp kiểm tra permission thất bại.

## Ví dụ triển khai hoàn chỉnh

```typescript
'use client';

import { useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';

export default function NewFeaturePage() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  const canAccessFeature = hasPermission('your_permission_key');
  
  useEffect(() => {
    if (!permissionsLoading && !canAccessFeature) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessFeature, router]);

  if (permissionsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center p-4">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Đang kiểm tra quyền truy cập...</span>
        </div>
      </Layout>
    );
  }

  if (!canAccessFeature) {
    return (
      <Layout>
        <div className="p-4 border rounded-md mb-4 bg-gray-50">
          <p className="text-center text-gray-500">
            Bạn không có quyền truy cập chức năng này
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-full">
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <h1 className="text-lg font-bold">Your Feature Title</h1>
        </div>
        {/* Your feature content */}
      </div>
    </Layout>
  );
}
```

## Kiểm tra Permission

Khi kiểm tra permission, cần đảm bảo:

1. Test loading states
2. Test unauthorized access
3. Test authorized access
4. Test permission changes during runtime
5. Test edge cases (e.g., network errors) 