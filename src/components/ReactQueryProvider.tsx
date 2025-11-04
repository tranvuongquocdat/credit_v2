'use client';

import { useState, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from '@/lib/react-query-client';
import { ReactQueryErrorBoundary } from './ReactQueryErrorBoundary';

interface ReactQueryProviderProps {
  children: React.ReactNode;
}

export function ReactQueryProvider({ children }: ReactQueryProviderProps) {
  // Create a single QueryClient instance for the app
  const [queryClient] = useState(() => getQueryClient());

  // Cleanup query client on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryErrorBoundary>
        {children}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </ReactQueryErrorBoundary>
    </QueryClientProvider>
  );
}