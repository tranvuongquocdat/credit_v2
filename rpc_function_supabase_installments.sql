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
    status_code text,      -- ACTIVE | OVERDUE | …
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
            status_code := 'closed';     status := 'Đã đóng';
        elsif r.status = 'deleted' then
            status_code := 'deleted';    status := 'Đã xóa';
        elsif r.status = 'finished' or r.payment_due_date is null then
            status_code := 'finished';   status := 'Hoàn thành';
        elsif r.status = 'bad_debt' then
            status_code := 'bad_debt';   status := 'Nợ xấu';

        /* còn lại – ON_TIME trước, kiểm tra quá hạn & chậm trả */
        else
            if r.contract_end < v_today then
                status_code := 'overdue';
                status := format('Quá hạn %s ngày', v_today - r.contract_end);
            elsif r.next_due <= v_today then
                status_code := 'late_interest';
                status := format('Chậm trả %s ngày', v_today - r.next_due + 1);
            else
                status_code := 'active';  status := 'Đang vay';
            end if;
        end if;

        description := status;
        installment_id := r.id;
        return next;
    end loop;
end $$;