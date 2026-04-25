-- Extend pawn_get_totals: add collateral_breakdown jsonb + p_count_mode param.
-- Drop trước vì RETURNS TABLE shape thay đổi.
--
-- p_count_mode:
--   'contracts' (default) → cnt = COUNT(*) hợp đồng theo mỗi tên tài sản
--   'quantity'            → cnt = SUM(coalesce(quantity, 1)) — tổng số lượng tài sản
--
-- Edge cases:
--   - collateral_detail có thể là jsonb 'object' (mới) hoặc 'string' (legacy) → handle qua json_typeof
--   - tên rỗng/null → group thành "Không tên" (giữ tổng đầy đủ, không hụt bản ghi)
--   - dedupe theo lower(trim(name)); display giữ casing của bản ghi đầu tiên (theo id)

DROP FUNCTION IF EXISTS public.pawn_get_totals(uuid, jsonb);
DROP FUNCTION IF EXISTS public.pawn_get_totals(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.pawn_get_totals(
  p_store_id   uuid,
  p_filters    jsonb default null,
  p_count_mode text  default 'contracts'
)
RETURNS TABLE (
  total_loan_amount    numeric,
  total_paid_interest  numeric,
  total_old_debt       numeric,
  total_interest_today numeric,
  collateral_breakdown jsonb
)
LANGUAGE sql
AS $$
/* 1. Lấy pawns theo filter cơ bản (chưa tính due_tomorrow) */
with base as (
  select *
  from   pawns p
  where  p.store_id = p_store_id

    and (
          coalesce(p_filters->>'status','') in ('', 'all', 'due_tomorrow', 'overdue', 'late_interest')
          or p.status = (p_filters->>'status')::pawn_status
        )

    and (
          coalesce(p_filters->>'contract_code','') = ''
          or p.contract_code ilike '%' || (p_filters->>'contract_code') || '%'
        )

    and (
          coalesce(p_filters->>'duration','') = ''
          or p.loan_period = (p_filters->>'duration')::int
        )

    and (
          coalesce(p_filters->>'start_date','') = ''
          or p.loan_date >= (p_filters->>'start_date')::date
        )
    and (
          coalesce(p_filters->>'end_date','') = ''
          or (p.loan_date - INTERVAL '1 day' + INTERVAL '1 day' * p.loan_period)::date <= (p_filters->>'end_date')::date
        )

    and (
          coalesce(p_filters->>'customer_name','') = ''
          or exists (
               select 1
               from   customers cu
               where  cu.id = p.customer_id
                 and  (cu.name ilike '%' || (p_filters->>'customer_name') || '%'
                       or unaccent(cu.name) ilike unaccent('%' || (p_filters->>'customer_name') || '%'))
          )
        )
),

/* 2. Lọc thêm khi client yêu cầu các trạng thái đặc biệt */
base2 as (
  select b.*
  from   base b
  where
    (p_filters->>'status' is null
     or p_filters->>'status' = ''
     or p_filters->>'status' = 'all'
     or p_filters->>'status' not in ('due_tomorrow', 'overdue', 'late_interest'))

    or (
      p_filters->>'status' = 'due_tomorrow'
      and exists (
        select 1 from get_pawn_next_payment_info(array[b.id]) np
        where np.pawn_id = b.id and np.next_date = (current_date + interval '1 day')::date
      )
    )

    or (
      p_filters->>'status' = 'overdue'
      and exists (
        select 1 from get_pawn_statuses(array[b.id]) st
        where st.pawn_id = b.id and st.status_code = 'OVERDUE'
      )
    )

    or (
      p_filters->>'status' = 'late_interest'
      and exists (
        select 1 from get_pawn_statuses(array[b.id]) st
        where st.pawn_id = b.id and st.status_code = 'LATE_INTEREST'
      )
    )
),

ids as ( select array_agg(id) arr_ids from base2 ),

principal as (
  select p.pawn_id, p.current_principal
  from ids
  join lateral get_pawn_current_principal(arr_ids) p on true
),

paid_int as (
  select i.pawn_id, i.paid_interest
  from ids
  join lateral get_pawn_paid_interest(arr_ids) i on true
),

old_debt as (
  select d.pawn_id, d.old_debt
  from ids
  join lateral get_pawn_old_debt(arr_ids) d on true
),

today_int as (
  select e.pawn_id, e.interest_today
  from ids
  join lateral get_pawn_expected_interest(arr_ids) e on true
),

/* ── Collateral name breakdown ── */
collateral_raw as (
  select
    b.id,
    case
      when json_typeof(b.collateral_detail) = 'object' then b.collateral_detail->>'name'
      when json_typeof(b.collateral_detail) = 'string' then b.collateral_detail #>> '{}'
      else null
    end as raw_name,
    case
      when json_typeof(b.collateral_detail) = 'object'
        then coalesce((b.collateral_detail->>'quantity')::numeric, 1)
      else 1
    end as qty
  from base2 b
),
collateral_norm as (
  select
    id,
    nullif(lower(trim(coalesce(raw_name, ''))), '') as norm_key,
    coalesce(nullif(trim(coalesce(raw_name, '')), ''), 'Không tên') as display_name,
    qty
  from collateral_raw
),
collateral_grouped as (
  select
    (array_agg(display_name order by id))[1] as name,
    case
      when p_count_mode = 'quantity' then sum(qty)
      else count(*)::numeric
    end as cnt
  from collateral_norm
  group by norm_key
),
collateral_json as (
  select jsonb_agg(
           jsonb_build_object('name', name, 'count', cnt)
           order by cnt desc, name asc
         ) as breakdown
  from collateral_grouped
)

select
  sum(coalesce(pr.current_principal, b.loan_amount)) as total_loan_amount,
  sum(coalesce(pi.paid_interest, 0))                 as total_paid_interest,
  sum(coalesce(od.old_debt, 0))                      as total_old_debt,
  sum(coalesce(ti.interest_today, 0))                as total_interest_today,
  (select breakdown from collateral_json)            as collateral_breakdown
from base2 b
left join principal pr on pr.pawn_id = b.id
left join paid_int  pi on pi.pawn_id = b.id
left join old_debt  od on od.pawn_id = b.id
left join today_int ti on ti.pawn_id = b.id;
$$;

GRANT EXECUTE ON FUNCTION public.pawn_get_totals(uuid, jsonb, text)
  TO anon, authenticated, service_role;
