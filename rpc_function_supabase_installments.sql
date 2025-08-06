create or replace function public.get_installment_old_debt(
  p_installment_ids uuid[]
)
returns table (
  installment_id uuid,
  old_debt       numeric
)
language sql
stable
as $$
with base as (                                   -- bảo đảm đủ dòng cho mọi id
  select id
       , installment_amount::numeric
       , loan_period
  from   installments
  where  id = any(p_installment_ids)
),
pay_stats as (                                   -- thống kê payment
  select  ih.installment_id,
          min(ih.effective_date)::date  as first_paid_date,
          max(ih.effective_date)::date  as last_paid_date,
          sum(ih.credit_amount
              - coalesce(ih.debit_amount,0))      as paid_amount
  from    installment_history ih
  where   ih.transaction_type = 'payment'
    and   ih.is_deleted = false
    and   ih.installment_id = any(p_installment_ids)
  group by ih.installment_id
),
debt_pay as (                                    -- tổng debt_payment
  select  ih.installment_id,
          sum(ih.credit_amount
              - coalesce(ih.debit_amount,0))      as debt_payment
  from    installment_history ih
  where   ih.transaction_type = 'debt_payment'
    and   ih.is_deleted = false
    and   ih.installment_id = any(p_installment_ids)
  group by ih.installment_id
)
select
  b.id                                            as installment_id,
  (
    /* expected */
    case
      when p.last_paid_date is null
        then 0                                   -- chưa đóng lần nào → 0
      else
        ((p.last_paid_date - p.first_paid_date + 1)        -- #days
          * (b.installment_amount / nullif(b.loan_period,1))
        )
    end
    /* minus what client đã đóng và debt_payment */
    - coalesce(p.paid_amount,0)
    - coalesce(d.debt_payment,0)
  )::numeric           as old_debt
from  base b
left join pay_stats p on p.installment_id = b.id
left join debt_pay  d on d.installment_id = b.id;
$$;


create or replace function public.installment_get_collected_profit(
  p_installment_ids uuid[]
)
returns table (
  installment_id     uuid,
  profit_collected   numeric
)
language sql
stable
as $$
with ids as (                           -- 0 → n dòng đầu vào
  select unnest(p_installment_ids) as id
),
pay as (                                -- tổng payment A & B
  select
    ids.id                                           ,
    -- B: đến CURRENT_DATE
    coalesce(
      sum(ih.credit_amount - coalesce(ih.debit_amount,0))
      filter (where ih.transaction_date::date <= current_date)
    ,0)                                as total_b,
    -- A: đến cuối tháng trước
    coalesce(
      sum(ih.credit_amount - coalesce(ih.debit_amount,0))
      filter (where ih.transaction_date::date <= (date_trunc('month', current_date) - interval '1 day')::date)
    ,0)                                as total_a
  from       ids
  left join  installment_history ih
         on  ih.installment_id = ids.id
        and ih.transaction_type = 'payment'
        and ih.is_deleted = false
  group by ids.id
)
select
  pay.id                                as installment_id,
  greatest(0, pay.total_b - inst.down_payment)
    - greatest(0, pay.total_a - inst.down_payment)  as profit_collected
from       pay
left join  installments inst on inst.id = pay.id;
$$;

create or replace function public.installment_get_paid_amount(
  p_installment_ids uuid[]
)
returns table (
  installment_id uuid,
  paid_amount    numeric
)
language sql
stable
as $$
with ids as (                                -- bảo đảm đủ dòng
  select unnest(p_installment_ids) as id
)
select
  ids.id               as installment_id,
  coalesce(
    sum(ih.credit_amount - coalesce(ih.debit_amount,0)), 0
  )                    as paid_amount
from       ids
left join  installment_history ih
       on  ih.installment_id = ids.id
      and  ih.transaction_type = 'payment'
      and  ih.is_deleted = false
group by ids.id;
$$;

create or replace function public.get_installment_statuses(
    p_installment_ids uuid[]
)
returns table (
    installment_id uuid,
    status_code text,      -- ON_TIME | OVERDUE | …
    status text,           -- Nhãn tiếng Việt
    description text
) language plpgsql security definer as $$
declare
    v_today date := current_date;
    r record;
begin
    for r in
        select i.*,
               /* ngày kết thúc hợp đồng */
               (i.loan_date + (i.loan_period - 1) * interval '1 day')::date               as contract_end,
               /* ngày phải đóng tiếp theo nếu chưa có payment_due_date */
               coalesce(i.payment_due_date,
                        (select max(ph.effective_date)::date from installment_history ph
                         where ph.installment_id = i.id and ph.transaction_type = 'payment' and ph.is_deleted = false)
                        + (i.payment_period * interval '1 day')
               )::date                                                                   as next_due
        from installments i
        where i.id = any(p_installment_ids)
    loop
        /* CLOSED / DELETED / FINISHED / BAD_DEBT giữ nguyên */
        if r.status = 'closed' then
            status_code := 'CLOSED';     status := 'Đã đóng';
        elsif r.status = 'deleted' then
            status_code := 'DELETED';    status := 'Đã xóa';
        elsif r.status = 'finished' or r.payment_due_date is null then
            status_code := 'FINISHED';   status := 'Hoàn thành';
        elsif r.status = 'bad_debt' then
            status_code := 'BAD_DEBT';   status := 'Nợ xấu';

        /* còn lại – ON_TIME trước, kiểm tra quá hạn & chậm trả */
        else
            if r.contract_end < v_today then
                status_code := 'OVERDUE';
                status := format('Quá hạn %s ngày', v_today - r.contract_end);
            elsif r.next_due <= v_today then
                status_code := 'LATE_INTEREST';
                status := format('Chậm trả %s ngày', v_today - r.next_due + 1);
            else
                status_code := 'ON_TIME';  status := 'Đang vay';
            end if;
        end if;

        description := status;
        installment_id := r.id;
        return next;
    end loop;
end $$;

-- Function to get next unpaid date for multiple installments
create or replace function public.installment_next_unpaid_date(
  p_installment_ids uuid[]
)
returns table (
  installment_id    uuid,
  next_unpaid_date  date
)
language sql
stable
as $$
with ids as (
  select unnest(p_installment_ids) as id
),
last_pay as (
  select   ih.installment_id,
           max(ih.effective_date)::date as last_paid
  from     installment_history ih
  where    ih.installment_id = any(p_installment_ids)
    and    ih.transaction_type = 'payment'
    and    ih.is_deleted = false
  group by ih.installment_id
),
inst_data as (
  select i.id, i.start_date::date as loan_start
  from installments i
  where i.id = any(p_installment_ids)
)
select 
  inst_data.id as installment_id,
  coalesce(
    (last_pay.last_paid + interval '1 day')::date,
    inst_data.loan_start
  ) as next_unpaid_date
from inst_data
left join last_pay on last_pay.installment_id = inst_data.id;
$$;

-- Function to get overdue statistics for multiple installments
create or replace function public.installment_overdue_stats(
  p_installment_ids uuid[]
)
returns table (
  installment_id uuid,
  late_periods   int,
  first_unpaid   date,
  last_check     date
)
language plpgsql
stable
as $$
declare
  rec record;
  v_today date := current_date;
  v_first_unpaid date;
  v_last_check date;
  v_unpaid_days int;
  v_late_periods int;
begin
  for rec in
    select 
      i.id,
      i.start_date::date as loan_date,
      i.duration as loan_period,
      i.payment_period,
      coalesce(max(ih.effective_date)::date, null) as last_paid
    from installments i
    left join installment_history ih on ih.installment_id = i.id 
      and ih.transaction_type = 'payment' 
      and ih.is_deleted = false
    where i.id = any(p_installment_ids)
    group by i.id, i.start_date, i.duration, i.payment_period
  loop
    -- Calculate first unpaid date
    v_first_unpaid := coalesce(
      (rec.last_paid + interval '1 day')::date,
      rec.loan_date
    );
    
    -- Calculate contract end date
    v_last_check := least(
      v_today,
      (rec.loan_date + (rec.loan_period - 1) * interval '1 day')::date
    );
    
    -- Calculate unpaid days and late periods
    if v_last_check >= v_first_unpaid then
      v_unpaid_days := (v_last_check - v_first_unpaid + 1);
      v_late_periods := floor(v_unpaid_days::numeric / coalesce(rec.payment_period, 10));
    else
      v_late_periods := 0;
    end if;
    
    installment_id := rec.id;
    late_periods := v_late_periods;
    first_unpaid := v_first_unpaid;
    last_check := v_last_check;
    
    return next;
  end loop;
end;
$$;

/*  Tổng hợp chỉ số cho danh sách hợp đồng trả góp
 *  – p_store_id : bắt buộc
 *  – p_filters  : JSONB chứa cùng cấu trúc filter ở React
 *      {
 *        contract_code : text | null,
 *        customer_name : text | null,
 *        start_date    : date | null,
 *        end_date      : date | null,
 *        duration      : int  | null,     -- loan_period
 *        status        : text | null      -- on_time | overdue | ... | due_tomorrow | all
 *      }
 */
create or replace function public.installment_get_totals(
  p_store_id uuid,
  p_filters  jsonb default null
)
returns table (
  total_amount_given numeric,
  total_paid         numeric,
  total_debt         numeric,
  total_daily_amount numeric,
  total_remaining    numeric
)
language plpgsql as
$$
declare
  v_ids uuid[];
begin
  /* =========== 1. Base set =========== */
  with base as (
    select *
    from   installments_by_store i
    where  i.store_id = p_store_id

      /* ---- status ---- */
      and (
            coalesce(p_filters->>'status','') in ('', 'all')             -- không lọc
            or (p_filters->>'status') in ('due_tomorrow','overdue','late_interest')
            or i.status = (p_filters->>'status')::installment_status     -- enum tĩnh
          )

      /* ---- due_tomorrow đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'due_tomorrow'
            or i.payment_due_date = (current_date + interval '1 day')::date
          )

      /* ---- overdue đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'overdue'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'OVERDUE'
            )
          )

      /* ---- late_interest đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'late_interest'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'LATE_INTEREST'
            )
          )

      /* ---- mã hợp đồng ---- */
      and (
            coalesce(p_filters->>'contract_code','') = ''
            or i.contract_code ilike '%' || (p_filters->>'contract_code') || '%'
          )

      /* ---- thời hạn vay (loan_period) ---- */
      and (
            coalesce(p_filters->>'duration','') = ''
            or i.loan_period = (p_filters->>'duration')::int
          )

      /* ---- khoảng ngày vay ---- */
      and (
            coalesce(p_filters->>'start_date','') = ''
            or i.loan_date >= (p_filters->>'start_date')::date
          )
      and (
            coalesce(p_filters->>'end_date','') = ''
            or (i.loan_date - INTERVAL '1 day' + INTERVAL '1 day' * i.loan_period)::date <= (p_filters->>'end_date')::date
          )

      /* ---- tên khách hàng ---- */
      and (
            coalesce(p_filters->>'customer_name','') = ''
            or exists (
                  select 1
                  from   customers c
                  where  c.id   = i.customer_id
                    and  (c.name ilike '%' || (p_filters->>'customer_name') || '%'
                          or unaccent(c.name) ilike unaccent('%' || (p_filters->>'customer_name') || '%'))
            )
          )
  )
  select array_agg(id) into v_ids from base;

  -- DEBUG
  raise log 'installment_get_totals – IDs after filter: %', v_ids;

  /* =========== 2. Phần còn lại giống cũ =========== */
  return query
  with base as (
    select *
    from   installments_by_store i
    where  i.store_id = p_store_id

      /* ---- status ---- */
      and (
            coalesce(p_filters->>'status','') in ('', 'all')             -- không lọc
            or (p_filters->>'status') in ('due_tomorrow','overdue','late_interest')
            or i.status = (p_filters->>'status')::installment_status     -- enum tĩnh
          )

      /* ---- due_tomorrow đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'due_tomorrow'
            or i.payment_due_date = (current_date + interval '1 day')::date
          )

      /* ---- overdue đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'overdue'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'OVERDUE'
            )
          )

      /* ---- late_interest đặc biệt ---- */
      and (
            (p_filters->>'status') <> 'late_interest'
            or exists (
                  select 1
                  from   get_installment_statuses( array[i.id] ) st
                  where  st.installment_id = i.id
                    and  st.status_code    = 'LATE_INTEREST'
            )
          )

      /* ---- mã hợp đồng ---- */
      and (
            coalesce(p_filters->>'contract_code','') = ''
            or i.contract_code ilike '%' || (p_filters->>'contract_code') || '%'
          )

      /* ---- thời hạn vay (loan_period) ---- */
      and (
            coalesce(p_filters->>'duration','') = ''
            or i.loan_period = (p_filters->>'duration')::int
          )

      /* ---- khoảng ngày vay ---- */
      and (
            coalesce(p_filters->>'start_date','') = ''
            or i.loan_date >= (p_filters->>'start_date')::date
          )
      and (
            coalesce(p_filters->>'end_date','') = ''
            or (i.loan_date - INTERVAL '1 day' + INTERVAL '1 day' * i.loan_period)::date <= (p_filters->>'end_date')::date
          )

      /* ---- tên khách hàng ---- */
      and (
            coalesce(p_filters->>'customer_name','') = ''
            or exists (
                  select 1
                  from   customers c
                  where  c.id   = i.customer_id
                    and  (c.name ilike '%' || (p_filters->>'customer_name') || '%'
                          or unaccent(c.name) ilike unaccent('%' || (p_filters->>'customer_name') || '%'))
            )
          )
  ),

  /* =========================
     2. Lấy mảng ID để gọi các hàm tổng hợp con
     ========================= */
  ids as (
    select array_agg(id) arr_ids from base
  ),

  /* ---- Tiền đã đóng (logic trùng với UI) ---- */
  paid as (
    select p.installment_id, p.paid_amount as paid
    from   ids
    join   lateral installment_get_paid_amount(arr_ids) p on true
  ),

  /* ---- Nợ (old_debt) – logic trùng UI ---- */
  debt as (
    select d.installment_id, d.old_debt
    from   ids
    join   lateral get_installment_old_debt(arr_ids) d on true
  )

  /* =========================
     3. Tổng hợp kết quả
     ========================= */
  select
    /* Tiền giao khách */
    sum(b.down_payment)                                    as total_amount_given,

    /* Tiền đã đóng */
    sum(coalesce(p.paid,0))                                as total_paid,

    /* Nợ hiện tại */
    sum(coalesce(d.old_debt,0))                            as total_debt,

    /* Tiền 1 ngày */
    sum(
          case
            when coalesce(b.loan_period,0) > 0
            then b.installment_amount / b.loan_period
            else 0
          end
    )                                                      as total_daily_amount,

    /* Còn phải đóng */
    sum(b.installment_amount - coalesce(p.paid,0))         as total_remaining
  from base b
  left join paid p  on p.installment_id  = b.id
  left join debt d  on d.installment_id  = b.id;
end;
$$;

-- Function to get latest payment dates for multiple installments (similar to credits system)
create or replace function public.get_latest_installment_payment_paid_dates(
  p_installment_ids uuid[]
)
returns table (
  installment_id uuid,
  latest_paid_date date
)
language sql
stable
as $$
with ids as (
  select unnest(p_installment_ids) as installment_id
)
select
  ids.installment_id,
  max(ih.effective_date)::date as latest_paid_date
from ids
left join installment_history ih
  on ih.installment_id = ids.installment_id
  and ih.transaction_type = 'payment'
  and ih.is_deleted = false
group by ids.installment_id;
$$;