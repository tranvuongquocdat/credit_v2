'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { initializeDefaultPermissions } from '@/lib/permission';

export function PermissionInitializer() {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInitialize = async () => {
    setIsInitializing(true);
    setError(null);

    try {
      const { error } = await initializeDefaultPermissions();
      if (error) {
        throw new Error('Không thể khởi tạo permissions mặc định');
      }
      setIsInitialized(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
      setError(errorMessage);
    } finally {
      setIsInitializing(false);
    }
  };

  if (isInitialized) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          Đã khởi tạo permissions mặc định thành công!
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Hệ thống cần khởi tạo permissions mặc định để sử dụng tính năng phân quyền.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleInitialize}
        disabled={isInitializing}
        className="w-full"
      >
        {isInitializing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Đang khởi tạo...
          </>
        ) : (
          'Khởi tạo permissions mặc định'
        )}
      </Button>
    </div>
  );
} 