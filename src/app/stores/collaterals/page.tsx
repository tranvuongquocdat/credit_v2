'use client';

import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useStore } from '@/contexts/StoreContext';
import { CollateralsPage } from '@/components/Collaterals';

export default function CollateralsPageRoute() {
  const { currentStore, loading: storeLoading } = useStore();

  // Show loading state while store context is initializing
  if (storeLoading) {
    return (
      <Layout>
        <div className="max-w-full">
          <div className="flex items-center justify-between border-b pb-2 mb-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Quản lý tài sản thế chấp</h1>
            </div>
          </div>
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Đang tải dữ liệu cửa hàng...</div>
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
            <div className="text-sm text-gray-500">
              Cửa hàng: {currentStore.name}
            </div>
          </div>
        </div>
        
        {/* Collaterals management component */}
        <CollateralsPage storeId={currentStore.id} />
      </div>
    </Layout>
  );
}
