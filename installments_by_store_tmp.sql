CREATE OR REPLACE VIEW installments_by_store_tmp AS
SELECT i.*,
       e.store_id,
       -- … các biểu thức tính loan_end_date, next_due_date …
       CASE
         WHEN i.status = 'closed'   THEN 'CLOSED'
         WHEN i.status = 'deleted'  THEN 'DELETED'
         WHEN i.status = 'bad_debt' THEN 'BAD_DEBT'
         WHEN i.payment_due_date IS NOT NULL 
              AND (i.loan_date + (i.loan_period - 1) * interval '1 day')::date < current_date
              THEN 'OVERDUE'
         WHEN i.payment_due_date IS NOT NULL 
              AND COALESCE(
                i.payment_due_date,
                (SELECT max(effective_date)::date
                 FROM installment_history
                 WHERE installment_id = i.id
                   AND transaction_type = 'payment'
                   AND is_deleted = false)
                + (i.payment_period * interval '1 day')
              )::date <= current_date
              THEN 'LATE_INTEREST'
         ELSE 'ON_TIME'
       END AS status_code
FROM   installments i
JOIN   employees   e ON e.id = i.employee_id
LEFT   JOIN (SELECT installment_id,
                    max(effective_date)::date AS last_paid
              FROM installment_history
              WHERE transaction_type = 'payment'
                AND is_deleted = false
              GROUP BY installment_id) lp
       ON lp.installment_id = i.id;