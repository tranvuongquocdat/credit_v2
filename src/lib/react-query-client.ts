import { QueryClient } from '@tanstack/react-query';

// Function to create a client for React Query with configuration optimized for installment data
// This ensures QueryClient is only created on the client side
export function getQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Installment data changes frequently with payments, but 2 minutes is good balance
        staleTime: 2 * 60 * 1000, // 2 minutes
        // Keep data in cache for 5 minutes after it's no longer needed
        gcTime: 5 * 60 * 1000, // 5 minutes
        // Retry failed requests once
        retry: (failureCount, error) => {
          // Extract status code from error if available
          const status = (error as { status?: number })?.status;
          // Don't retry authentication errors
          if (status === 401 || status === 403) return false;
          // Don't retry validation errors
          if (status === 400) return false;
          // Retry other errors up to 1 time
          return failureCount < 1;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Enable refetching on window focus (useful for real-time updates)
        refetchOnWindowFocus: false, // Disable to reduce unnecessary API calls
        // Don't refetch on reconnect automatically
        refetchOnReconnect: true,
      },
      mutations: {
        // Retry failed mutations once
        retry: (failureCount, error) => {
          // Extract status code from error if available
          const status = (error as { status?: number })?.status;
          // Don't retry authentication errors
          if (status === 401 || status === 403) return false;
          // Don't retry validation errors
          if (status === 400) return false;
          // Retry other errors up to 1 time
          return failureCount < 1;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Global error handling for mutations
        onError: (error) => {
          // Global error logging for debugging
          if (process.env.NODE_ENV === 'development') {
            console.error('Mutation error:', error);
          }
          // Could send to error monitoring service here
        },
      },
    },
  });
}