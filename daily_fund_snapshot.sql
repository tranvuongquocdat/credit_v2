-- SQL script to take a daily snapshot of each store's cash fund
-- This will run at midnight (00:00) every day via Supabase cron job

-- Insert a new record in store_total_fund for each active store
INSERT INTO public.store_total_fund (store_id, total_fund)
SELECT 
  id as store_id,
  cash_fund as total_fund
FROM 
  public.stores
WHERE 
  status = 'active' 
  AND is_deleted = false; 