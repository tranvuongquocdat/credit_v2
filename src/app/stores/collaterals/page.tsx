'use client';

import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { CollateralsPage } from '@/components/Collaterals';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CollateralsPageRoute() {
  const { currentStore, loading: storeLoading } = useStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const router = useRouter();
  
  const canAccessCollaterals = hasPermission('cau_hinh_hang_hoa');
  
  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!permissionsLoading && !canAccessCollaterals) {
      router.push('/');
    }
  }, [permissionsLoading, canAccessCollaterals, router]);

  // Show loading state while checking permissions or loading store
  if (permissionsLoading || storeLoading) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý tài sản thế chấp</h1>
            </div>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Đang tải dữ liệu...</div>
          </div>
        </div>
      </Layout>
    );
  }
  
  // Show access denied if user doesn't have permission
  if (!canAccessCollaterals) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý tài sản thế chấp</h1>
            </div>
          </div>
          <div className="p-4 border rounded-md mb-4 bg-gray-50">
            <p className="text-center text-gray-500">Bạn không có quyền truy cập chức năng này</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Show error if no store is selected
  if (!currentStore) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý tài sản thế chấp</h1>
            </div>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="text-red-500">Vui lòng chọn cửa hàng để tiếp tục</div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-full">
        {/* Title and store info */}
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Quản lý tài sản thế chấp</h1>
          </div>
        </div>
        
        {/* Collaterals management component */}
        <CollateralsPage storeId={currentStore.id} />
      </div>
    </Layout>
  );
}
