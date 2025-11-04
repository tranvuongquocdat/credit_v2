'use client';

import React from 'react';
import { useQueryClient, QueryStatus } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function CacheDebugger() {
  const queryClient = useQueryClient();

  const getCacheInfo = () => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();

    return {
      totalQueries: queries.length,
      activeQueries: queries.filter(q => q.state.fetchStatus === 'fetching').length,
      cachedQueries: queries.filter(q => q.state.status === 'success').length,
      staleQueries: queries.filter(q => q.state.isInvalidated || (Date.now() - q.state.dataUpdatedAt > 120000)).length,
      queries: queries.map(q => ({
        key: JSON.stringify(q.queryKey),
        status: q.state.status,
        isStale: q.state.isInvalidated || (Date.now() - q.state.dataUpdatedAt > 120000),
        lastFetched: q.state.dataUpdatedAt ? new Date(q.state.dataUpdatedAt).toLocaleTimeString() : 'Never',
        dataCount: Array.isArray(q.state.data) ? q.state.data.length :
                   typeof q.state.data === 'object' && q.state.data !== null ? Object.keys(q.state.data).length :
                   q.state.data !== null ? 1 : 0,
      }))
    };
  };

  const [cacheInfo, setCacheInfo] = React.useState(getCacheInfo);

  const refreshCacheInfo = () => {
    setCacheInfo(getCacheInfo());
  };

  const clearCache = () => {
    queryClient.clear();
    refreshCacheInfo();
  };

  // Auto-refresh cache info every 2 seconds
  React.useEffect(() => {
    const interval = setInterval(refreshCacheInfo, 2000);
    return () => clearInterval(interval);
  }, []);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <Card className="bg-yellow-50 border-yellow-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>🔍 React Query Cache Debugger</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={refreshCacheInfo}>
                🔄
              </Button>
              <Button size="sm" variant="outline" onClick={clearCache}>
                🗑️
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Total Queries:</span>
              <Badge variant="secondary">{cacheInfo.totalQueries}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Active:</span>
              <Badge variant="default">{cacheInfo.activeQueries}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Cached:</span>
              <Badge variant="secondary">{cacheInfo.cachedQueries}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Stale:</span>
              <Badge variant="outline">{cacheInfo.staleQueries}</Badge>
            </div>

            {cacheInfo.queries.slice(0, 3).map((query, index) => (
              <div key={index} className="border-t pt-2 mt-2">
                <div className="font-mono text-xs truncate" title={query.key}>
                  {query.key.split('","').slice(0, 2).join('","')}...
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">
                    {query.lastFetched} • {query.dataCount} items
                  </span>
                  <Badge
                    variant={query.isStale ? "outline" : "secondary"}
                    className="text-xs"
                  >
                    {query.isStale ? "Stale" : "Fresh"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}