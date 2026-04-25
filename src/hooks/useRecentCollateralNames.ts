import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const MAX_SUGGESTIONS = 5;
const FETCH_LIMIT = 100;

export function useRecentCollateralNames(storeId?: string, collateralId?: string) {
  return useQuery({
    queryKey: ['recent-collateral-names', storeId, collateralId],
    enabled: Boolean(storeId && collateralId),
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('pawns')
        .select('collateral_detail, created_at')
        .eq('store_id', storeId!)
        .eq('collateral_id', collateralId!)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);

      if (error) throw error;

      const seen = new Set<string>();
      const result: string[] = [];
      for (const row of data ?? []) {
        const detail = row.collateral_detail as { name?: string } | string | null;
        const rawName =
          typeof detail === 'string' ? detail : detail?.name;
        const name = rawName?.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(name);
        if (result.length >= MAX_SUGGESTIONS) break;
      }
      return result;
    },
  });
}
