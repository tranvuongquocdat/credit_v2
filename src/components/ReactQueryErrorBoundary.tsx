'use client';

import React from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ReactQueryErrorBoundaryProps {
  children: React.ReactNode;
}

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Lỗi tải dữ liệu</AlertTitle>
          <AlertDescription>
            Đã xảy ra lỗi khi tải dữ liệu từ máy chủ. Vui lòng thử lại.
          </AlertDescription>
        </Alert>

        <div className="mt-4 space-y-2">
          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer hover:text-gray-800">
              Xem chi tiết lỗi
            </summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
              {error.message}
            </pre>
          </details>

          <Button
            onClick={resetErrorBoundary}
            className="w-full"
            variant="outline"
          >
            Thử lại
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ReactQueryErrorBoundary({ children }: ReactQueryErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          FallbackComponent={ErrorFallback}
          onReset={reset}
          onError={(error: Error, errorInfo: { componentStack?: string | null }) => {
            // Log errors to monitoring service in production
            if (process.env.NODE_ENV === 'development') {
              console.error('React Query Error Boundary caught an error:', error, errorInfo);
            }
          }}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}