# Money-by-Day: Cho vay/Nợ lịch sử chuẩn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay hack "cho vay/nợ ngày quá khứ" trong báo cáo money-by-day (v1) bằng số tái dựng đúng từ lịch sử, qua 1 RPC mới.

**Architecture:** Thêm 1 Postgres RPC `rpc_money_by_day_loans_debt(store, start, end)` trả cho mỗi ngày 6 số (pawn/credit/installment × loan/debt), tái dựng theo `created_at <= ngày` (QĐ-1) và trạng thái đóng/mở mới-nhất (QĐ-2), tái dùng công thức của các RPC hôm nay. Frontend gọi 1 lần thay cho vòng lặp `fetchLoansForDate` + bỏ hack 5%. **Chỉ thêm, không sửa** RPC cũ (an toàn v2 — chung DB).

**Tech Stack:** Supabase Postgres (SQL RPC), Next.js 15 + React Query (frontend), Playwright (UI check).

**Spec:** `docs/superpowers/specs/2026-07-01-money-by-day-historical-loan-debt-design.md`

**Ràng buộc kiểm thử:** prod chỉ đọc; RPC là **additive** nên deploy sớm an toàn (chưa ai gọi tới khi chưa sửa FE). "Test" chính = **so số RPC(hôm nay) với dashboard tới từng đồng** bằng query read-only. Deploy migration = thao tác có quyền write (bạn/CI apply); các bước verify là read-only mình chạy được.

---

## File Structure

- **Create:** `supabase/migrations/20260701000000_money_by_day_loans_debt.sql` — RPC mới (nguồn chân lý để deploy).
- **Create:** `scripts/verify_money_by_day_rpc.py` — script so RPC vs dashboard (read-only, dùng service key trong `.env.local`).
- **Modify:** `src/app/reports/money-by-day/page.tsx` — bỏ `fetchLoansForDate` + hack 5% + nhánh isToday; gọi RPC mới.

---

## Task 1: Viết RPC `rpc_money_by_day_loans_debt` (đầy đủ 3 loại)

**Files:**
- Create: `supabase/migrations/20260701000000_money_by_day_loans_debt.sql`

- [ ] **Step 1: Viết migration RPC**

```sql
-- Money-by-day: cho vay + nợ cũ theo từng ngày, tái dựng từ lịch sử.
-- QĐ-1: mốc "tính đến ngày X" = created_at::date <= X (ngày ghi = ngày thực trả).
-- QĐ-2: "đang chạy tại X" = loan_date<=X và sự kiện đóng/mở/xoá MỚI NHẤT (created_at<=X) không phải close/delete.
-- ADDITIVE: không sửa RPC/hàm cũ. Chỉ ĐỌC + gọi calc_expected_until / calc_pawn_expected_until.
create or replace function public.rpc_money_by_day_loans_debt(
  p_store_id   uuid,
  p_start_date date,
  p_end_date   date
)
returns table (
  as_of_date       date,
  pawn_loan        numeric,
  credit_loan      numeric,
  installment_loan numeric,
  pawn_debt        numeric,
  credit_debt      numeric,
  installment_debt numeric
)
language sql
stable
as $$
with days as (
  select generate_series(p_start_date, p_end_date, interval '1 day')::date as d
),
inst as (
  select i.id, i.loan_date::date as ld, i.installment_amount::numeric as amt, i.loan_period::numeric as period
  from installments i
  join employees e on e.id = i.employee_id
  where e.store_id = p_store_id
),
cr as (
  select c.id, c.loan_date::date as ld, c.loan_amount::numeric as amt
  from credits c where c.store_id = p_store_id
),
pw as (
  select p.id, p.loan_date::date as ld, p.loan_amount::numeric as amt
  from pawns p where p.store_id = p_store_id
),
-- ================= INSTALLMENTS =================
inst_calc as (
  select dy.d,
    sum(case when i.ld <= dy.d and coalesce(st.reopened, true)
             then i.amt - coalesce(p.paid, 0) else 0 end) as loan,
    sum(case when i.ld <= dy.d and coalesce(st.reopened, true)
             then (case when p.maxeff is null then 0
                        else (p.maxeff - p.mineff + 1) * i.amt / nullif(i.period, 0) end)
                  - coalesce(p.paid, 0) - coalesce(dp.dpaid, 0)
             else 0 end) as debt
  from days dy cross join inst i
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as paid,
           min(effective_date::date) as mineff, max(effective_date::date) as maxeff
    from installment_history
    where installment_id = i.id and transaction_type='payment' and is_deleted=false
      and created_at::date <= dy.d
  ) p on true
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as dpaid
    from installment_history
    where installment_id = i.id and transaction_type='debt_payment' and is_deleted=false
      and created_at::date <= dy.d
  ) dp on true
  left join lateral (
    select (transaction_type='contract_reopen') as reopened
    from installment_history
    where installment_id = i.id
      and transaction_type in ('contract_close','contract_delete','contract_reopen')
      and is_deleted=false and created_at::date <= dy.d
    order by created_at desc limit 1
  ) st on true
  group by dy.d
),
-- ================= CREDITS =================
cr_calc as (
  select dy.d,
    sum(case when c.ld <= dy.d and coalesce(st.reopened, true)
             then c.amt + coalesce(pr.delta,0) else 0 end) as loan,
    sum(case when c.ld <= dy.d and coalesce(st.reopened, true)
             then (case when p.last_eff is null then 0
                        else coalesce(public.calc_expected_until(c.id, p.last_eff), 0) end)
                  - coalesce(p.paid,0) - coalesce(dp.dpaid,0)
             else 0 end) as debt
  from days dy cross join cr c
  left join lateral (
    select max(effective_date::date) as last_eff, sum(credit_amount) as paid
    from credit_history
    where credit_id=c.id and transaction_type='payment' and is_deleted=false
      and created_at::date <= dy.d
  ) p on true
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as dpaid
    from credit_history
    where credit_id=c.id and transaction_type='debt_payment' and is_deleted=false
      and created_at::date <= dy.d
  ) dp on true
  left join lateral (
    select sum(case when transaction_type='additional_loan' then coalesce(debit_amount,0)
                    when transaction_type='principal_repayment' then -coalesce(credit_amount,0)
                    else 0 end) as delta
    from credit_history
    where credit_id=c.id and transaction_type in ('additional_loan','principal_repayment')
      and is_deleted=false and created_at::date <= dy.d
  ) pr on true
  left join lateral (
    select (transaction_type='contract_reopen') as reopened
    from credit_history
    where credit_id=c.id
      and transaction_type in ('contract_close','contract_delete','contract_reopen')
      and is_deleted=false and created_at::date <= dy.d
    order by created_at desc limit 1
  ) st on true
  group by dy.d
),
-- ================= PAWNS =================
pw_calc as (
  select dy.d,
    sum(case when w.ld <= dy.d and coalesce(st.reopened, true)
             then w.amt + coalesce(pr.delta,0) else 0 end) as loan,
    sum(case when w.ld <= dy.d and coalesce(st.reopened, true)
             then (case when p.last_eff is null then 0
                        else coalesce(public.calc_pawn_expected_until(w.id, p.last_eff), 0) end)
                  - coalesce(p.paid,0) - coalesce(dp.dpaid,0)
             else 0 end) as debt
  from days dy cross join pw w
  left join lateral (
    select max(effective_date::date) as last_eff, sum(credit_amount) as paid
    from pawn_history
    where pawn_id=w.id and transaction_type='payment' and is_deleted=false
      and created_at::date <= dy.d
  ) p on true
  left join lateral (
    select sum(credit_amount - coalesce(debit_amount,0)) as dpaid
    from pawn_history
    where pawn_id=w.id and transaction_type='debt_payment' and is_deleted=false
      and created_at::date <= dy.d
  ) dp on true
  left join lateral (
    select sum(case when transaction_type='additional_loan' then coalesce(debit_amount,0)
                    when transaction_type='principal_repayment' then -coalesce(credit_amount,0)
                    else 0 end) as delta
    from pawn_history
    where pawn_id=w.id and transaction_type in ('additional_loan','principal_repayment')
      and is_deleted=false and created_at::date <= dy.d
  ) pr on true
  left join lateral (
    select (transaction_type='contract_reopen') as reopened
    from pawn_history
    where pawn_id=w.id
      and transaction_type in ('contract_close','contract_delete','contract_reopen')
      and is_deleted=false and created_at::date <= dy.d
    order by created_at desc limit 1
  ) st on true
  group by dy.d
)
select
  d.d as as_of_date,
  coalesce(pw_calc.loan,0)   as pawn_loan,
  coalesce(cr_calc.loan,0)   as credit_loan,
  coalesce(inst_calc.loan,0) as installment_loan,
  coalesce(pw_calc.debt,0)   as pawn_debt,
  coalesce(cr_calc.debt,0)   as credit_debt,
  coalesce(inst_calc.debt,0) as installment_debt
from days d
left join inst_calc on inst_calc.d = d.d
left join cr_calc   on cr_calc.d   = d.d
left join pw_calc   on pw_calc.d   = d.d
order by d.d;
$$;
```

- [ ] **Step 2: Commit migration**

```bash
git add supabase/migrations/20260701000000_money_by_day_loans_debt.sql
git commit -m "feat(sql): rpc_money_by_day_loans_debt - cho vay/no theo ngay (chua deploy)"
```

- [ ] **Step 3: Deploy RPC lên Supabase** *(cần quyền write — bạn/CI apply; additive nên an toàn, chưa ai gọi)*

Chạy nội dung migration trên Supabase SQL editor **hoặc** `supabase db push`.
Expected: `CREATE FUNCTION` thành công, không lỗi (nếu thiếu `calc_expected_until`/`calc_pawn_expected_until` sẽ báo → 2 hàm này đã tồn tại nên phải OK).

---

## Task 2: Verify RPC(hôm nay) == dashboard — CỔNG CHẶN tiền

**Files:**
- Create: `scripts/verify_money_by_day_rpc.py`

- [ ] **Step 1: Viết script verify (read-only, so 6 số tại hôm nay)**

```python
#!/usr/bin/env python3
# So rpc_money_by_day_loans_debt(store, today, today) với đúng công thức dashboard hôm nay.
# Read-only. Dùng SUPABASE_SERVICE_ROLE_KEY trong credit/.env.local.
import json, subprocess, sys, datetime, os, re

ENV = open(os.path.join(os.path.dirname(__file__), '..', '.env.local')).read()
URL = re.search(r'NEXT_PUBLIC_SUPABASE_URL=(\S+)', ENV).group(1)
KEY = re.search(r'SUPABASE_SERVICE_ROLE_KEY=(\S+)', ENV).group(1)
TODAY = datetime.date.today().isoformat()

def curl_get(path, params, rng="0-9999"):
    cmd = ["curl","-s","-G",f"{URL}/rest/v1/{path}"]
    for k,v in params.items(): cmd += ["--data-urlencode", f"{k}={v}"]
    cmd += ["-H",f"apikey: {KEY}","-H",f"Authorization: Bearer {KEY}","-H",f"Range: {rng}"]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)

def rpc(fn, body):
    out = subprocess.run(["curl","-s","-X","POST",f"{URL}/rest/v1/rpc/{fn}",
      "-H",f"apikey: {KEY}","-H",f"Authorization: Bearer {KEY}",
      "-H","Content-Type: application/json","-d",json.dumps(body)],
      capture_output=True, text=True).stdout
    return json.loads(out)

def verify_store(store_id, label):
    print(f"\n=== {label} ({store_id[:8]}) ===")
    row = rpc("rpc_money_by_day_loans_debt",
              {"p_store_id":store_id,"p_start_date":TODAY,"p_end_date":TODAY})[0]

    # ---- INSTALLMENT dashboard def (today) ----
    inst = curl_get("installments_by_store",
        {"select":"id,installment_amount,down_payment,status_code","store_id":f"eq.{store_id}",
         "status_code":"in.(ON_TIME,OVERDUE,LATE_INTEREST)"})
    iids = [r["id"] for r in inst]
    paid = {}; debt = {}
    for i in range(0,len(iids),400):
        b=iids[i:i+400]
        for r in rpc("installment_get_paid_amount",{"p_installment_ids":b}): paid[r["installment_id"]]=float(r["paid_amount"])
        for r in rpc("get_installment_old_debt",{"p_installment_ids":b}):     debt[r["installment_id"]]=float(r["old_debt"])
    dash_iloan = sum((r["installment_amount"] or 0) - paid.get(r["id"],0) for r in inst)
    dash_idebt = sum(debt.get(r["id"],0) for r in inst)

    # ---- CREDIT dashboard def (today) ----
    cr = curl_get("credits", {"select":"id","store_id":f"eq.{store_id}","status":"not.in.(closed,deleted)"})
    cids=[r["id"] for r in cr]; cloan=0.0; cdebt=0.0
    for i in range(0,len(cids),400):
        b=cids[i:i+400]
        for r in rpc("get_current_principal",{"p_credit_ids":b}): cloan+=float(r["current_principal"])
        for r in rpc("get_old_debt",{"p_credit_ids":b}):          cdebt+=float(r["old_debt"])

    # ---- PAWN dashboard def (today) ----
    pw = curl_get("pawns", {"select":"id","store_id":f"eq.{store_id}","status":"not.in.(closed,deleted)"})
    pids=[r["id"] for r in pw]; ploan=0.0; pdebt=0.0
    for i in range(0,len(pids),400):
        b=pids[i:i+400]
        for r in rpc("get_pawn_current_principal",{"p_pawn_ids":b}): ploan+=float(r["current_principal"])
        for r in rpc("get_pawn_old_debt",{"p_pawn_ids":b}):          pdebt+=float(r["old_debt"])

    checks = [
        ("installment_loan", float(row["installment_loan"]), dash_iloan),
        ("installment_debt", float(row["installment_debt"]), dash_idebt),
        ("credit_loan",      float(row["credit_loan"]),      cloan),
        ("credit_debt",      float(row["credit_debt"]),      cdebt),
        ("pawn_loan",        float(row["pawn_loan"]),        ploan),
        ("pawn_debt",        float(row["pawn_debt"]),        pdebt),
    ]
    ok=True
    for name, rpc_v, dash_v in checks:
        diff = round(rpc_v - dash_v)
        flag = "OK" if diff==0 else "*** LỆCH ***"
        if diff!=0: ok=False
        print(f"  {name:18} RPC={rpc_v:>16,.0f}  dashboard={dash_v:>16,.0f}  diff={diff:>12,}  {flag}")
    return ok

if __name__ == "__main__":
    stores = [
        ("17bf2ffb-29ee-4e2e-8445-9b030417cf3b", "Nam sms (tra gop)"),
        ("e6e318a5-1470-441c-b677-8df6474d2d2f", "H1168 (tin dung)"),
        ("ce1825b8-645b-4724-9dca-6f3a72a42cd9", "Linh sms"),
    ]
    all_ok = all(verify_store(s,l) for s,l in stores)
    print("\n" + ("✅ TẤT CẢ KHỚP — cổng chặn PASS" if all_ok else "❌ CÓ LỆCH — sửa RPC trước khi đi tiếp"))
    sys.exit(0 if all_ok else 1)
```

- [ ] **Step 2: Chạy verify**

Run: `cd credit && python3 scripts/verify_money_by_day_rpc.py`
Expected: mọi dòng `diff=0` / `OK`, in `✅ TẤT CẢ KHỚP`.

- [ ] **Step 3: Nếu có LỆCH → sửa SQL trong Task 1, deploy lại, chạy lại verify**

Debug theo cột lệch: `*_loan` lệch → soi CTE loan (delta principal / active flag); `*_debt` lệch → soi expected/paid/last_eff. Lặp tới khi diff=0.

- [ ] **Step 4: Commit script khi PASS**

```bash
git add scripts/verify_money_by_day_rpc.py
git commit -m "test: verify rpc_money_by_day_loans_debt khop dashboard hom nay (3 store)"
```

---

## Task 3: Test lịch sử — HĐ đóng/mở/đảo hành xử đúng

**Files:** (dùng lại script verify, thêm hàm spot-check)

- [ ] **Step 1: Thêm spot-check vào `scripts/verify_money_by_day_rpc.py`**

```python
def spot_check_closed():
    # HĐ trả góp đã đóng: ngày TRƯỚC khi đóng phải còn cho vay > 0; SAU khi đóng = 0.
    # Lấy 1 HĐ closed + created_at của contract_close, gọi RPC store 1 ngày trước & 1 ngày sau.
    STORE="17bf2ffb-29ee-4e2e-8445-9b030417cf3b"
    closed = curl_get("installments_by_store",
        {"select":"id","store_id":f"eq.{STORE}","status_code":"eq.CLOSED","limit":"1"})[0]["id"]
    ev = curl_get("installment_history",
        {"select":"created_at","installment_id":f"eq.{closed}","transaction_type":"eq.contract_close",
         "is_deleted":"eq.false","order":"created_at.desc","limit":"1"})[0]["created_at"][:10]
    import datetime as dt
    close_d = dt.date.fromisoformat(ev)
    before = (close_d - dt.timedelta(days=1)).isoformat()
    after  = (close_d + dt.timedelta(days=1)).isoformat()
    # Không thể tách 1 HĐ khỏi tổng store dễ dàng => kiểm định tính: tổng loan ngày 'after' <= 'before'
    rb = rpc("rpc_money_by_day_loans_debt",{"p_store_id":STORE,"p_start_date":before,"p_end_date":after})
    print("\n=== spot-check HĐ đóng (created_at contract_close =", ev, ") ===")
    for r in rb: print(f"  {r['as_of_date']} installment_loan={float(r['installment_loan']):,.0f}")
    print("  → kỳ vọng: loan không tăng bất thường quanh ngày đóng (HĐ này rời khỏi tổng sau đóng)")

def spot_check_reopen():
    # HĐ có contract_reopen: sau ngày reopen phải ĐANG CHẠY lại (đừng bị coi là đóng).
    r = curl_get("installment_history",
        {"select":"installment_id,created_at","transaction_type":"eq.contract_reopen","is_deleted":"eq.false","limit":"1"})[0]
    print("\n=== spot-check reopen: HĐ", r["installment_id"][:8], "reopen", r["created_at"][:10], "===")
    print("  → xác nhận HĐ này thuộc 1 store; gọi RPC store đó quanh ngày reopen, loan phải > 0 sau reopen")
```

- [ ] **Step 2: Chạy & đọc kết quả**

Run: `cd credit && python3 -c "import scripts.verify_money_by_day_rpc as v; v.spot_check_closed(); v.spot_check_reopen()"`
Expected: quanh ngày đóng, `installment_loan` không nhảy vô lý; HĐ reopen còn cho vay sau ngày mở lại.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_money_by_day_rpc.py
git commit -m "test: spot-check lich su dong/mo HD cho rpc money-by-day"
```

---

## Task 4: Đo hiệu năng trên store nặng nhất (Nam sms)

- [ ] **Step 1: Đo thời gian RPC dải 60 ngày**

Run:
```bash
cd credit
KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2)
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
time curl -s -X POST "$URL/rest/v1/rpc/rpc_money_by_day_loans_debt" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"p_store_id":"17bf2ffb-29ee-4e2e-8445-9b030417cf3b","p_start_date":"2026-05-01","p_end_date":"2026-06-30"}' \
  -o /dev/null -w "HTTP %{http_code}  time %{time_total}s\n"
```
Expected: `HTTP 200`, `time_total` ghi nhận lại.

- [ ] **Step 2: Nếu > 3s → tối ưu**

Thêm index hỗ trợ (ADDITIVE, an toàn) trong 1 migration mới:
```sql
create index if not exists idx_installment_history_id_created
  on installment_history (installment_id, created_at) where is_deleted = false;
create index if not exists idx_credit_history_id_created
  on credit_history (credit_id, created_at) where is_deleted = false;
create index if not exists idx_pawn_history_id_created
  on pawn_history (pawn_id, created_at) where is_deleted = false;
```
Deploy, đo lại. Nếu vẫn chậm: chuyển lateral-per-day sang cumulative bằng window (ghi chú kỹ thuật trong PR), giữ nguyên kết quả (re-run Task 2 verify sau mọi thay đổi).

- [ ] **Step 3: Commit (nếu thêm index)**

```bash
git add supabase/migrations/20260701010000_money_by_day_indexes.sql
git commit -m "perf(sql): index history (id, created_at) cho rpc money-by-day"
```

---

## Task 5: Frontend — bỏ hack, gọi RPC mới

**Files:**
- Modify: `src/app/reports/money-by-day/page.tsx`

- [ ] **Step 1: Xoá hàm `fetchLoansForDate` (toàn bộ, ~dòng 115–226) và mọi tham chiếu nhánh isToday/hack 5%**

Xoá nguyên hàm `const fetchLoansForDate = async (date: Date) => { ... };`.

- [ ] **Step 2: Thêm helper gọi RPC series (đặt ngay trên `fetchDailyCashFlow`)**

```typescript
type LoanDebtRow = {
  as_of_date: string;
  pawn_loan: number; credit_loan: number; installment_loan: number;
  pawn_debt: number; credit_debt: number; installment_debt: number;
};

// Trả map 'yyyy-MM-dd' -> số cho vay/nợ tái dựng đúng theo ngày (thay hack fetchLoansForDate).
const fetchLoansDebtSeries = async (
  storeId: string, start: string, end: string
): Promise<Map<string, LoanDebtRow>> => {
  const { data, error } = await (supabase as any).rpc('rpc_money_by_day_loans_debt', {
    p_store_id: storeId, p_start_date: start, p_end_date: end,
  });
  if (error) { console.error('rpc_money_by_day_loans_debt', error); return new Map(); }
  const m = new Map<string, LoanDebtRow>();
  (Array.isArray(data) ? data : []).forEach((r: LoanDebtRow) => m.set(r.as_of_date, r));
  return m;
};
```

- [ ] **Step 3: Trong `fetchDailyCashFlow`, thay `loansByDate` bằng lookup từ RPC**

Thay dòng `const loansByDate = await Promise.all(dates.map((d) => fetchLoansForDate(d)));` bằng:
```typescript
const ldSeries = await fetchLoansDebtSeries(storeId, startDate, endDate);
```
Và trong `dailyData = rows.slice(1).map((r, i) => { ... })`, thay `const loans = loansByDate[i];` bằng:
```typescript
const key = format(dates[i], 'yyyy-MM-dd');
const ld = ldSeries.get(key);
const loans = {
  pawn: ld?.pawn_loan ?? 0,        pawnDebt: ld?.pawn_debt ?? 0,
  credit: ld?.credit_loan ?? 0,    creditDebt: ld?.credit_debt ?? 0,
  installment: ld?.installment_loan ?? 0, installmentDebt: ld?.installment_debt ?? 0,
};
```
Giữ nguyên phần dùng `loans.pawn`, `loans.pawnDebt`, ... phía dưới (line 272–291) — không đổi.

- [ ] **Step 4: Kiểm build/lint**

Run: `cd credit && npm run build`
Expected: build PASS, không còn tham chiếu `fetchLoansForDate`, `pawnSummary`/`creditSummary`/`installmentSummary` (nếu chỉ dùng cho nhánh isToday đã xoá thì gỡ import thừa).

- [ ] **Step 5: Commit**

```bash
git add src/app/reports/money-by-day/page.tsx
git commit -m "fix(money-by-day): dung RPC tai dung cho vay/no theo ngay, bo hack 5%"
```

---

## Task 6: Verify UI thật (không nhảy bậc tại hôm nay)

- [ ] **Step 1: Chạy app + mở báo cáo dòng tiền (store Nam sms), dải gồm hôm nay và vài ngày trước**

Run: `cd credit && npm run dev` → mở `/reports/money-by-day`, chọn store "Nam sms", dải ví dụ 25/6–1/7.

- [ ] **Step 2: Kiểm mắt**

Expected:
- Cột "cho vay" trả góp các ngày quá khứ **không còn ~gấp 3** (khớp cỡ 3,3 tỷ chứ không 9,8 tỷ như trước).
- Không có "nhảy bậc" lớn giữa hôm-qua và hôm-nay.
- Cột nợ không còn = 5% tròn trịa của cho vay.

- [ ] **Step 3: Đối chiếu số hôm nay trên UI với dashboard trang trả góp**

Mở `/installments`, so ô "Cho vay"/"Lãi..."(nợ) của store với hàng "hôm nay" trong money-by-day → phải bằng nhau.

- [ ] **Step 4: Commit (nếu có chỉnh nhỏ)** — nếu không, kết thúc.

---

## Self-Review (đã chạy)

- **Spec coverage:** QĐ-1 (created_at) → Task 1 (mọi `created_at<=dy.d`) ✔; QĐ-2 latest-event (reopen) → Task 1 CTE `st` + Task 3 ✔; công thức cho vay/nợ 3 loại → Task 1 ✔; verify khớp hôm nay → Task 2 (cổng chặn) ✔; perf → Task 4 ✔; FE bỏ hack → Task 5 ✔; không sửa RPC cũ → chỉ CREATE + gọi calc_*expected_until ✔; ổn định v2 → additive ✔.
- **Placeholder scan:** không TBD; mọi step có SQL/code/command thật.
- **Type consistency:** RPC cột `pawn_loan/credit_loan/installment_loan/pawn_debt/credit_debt/installment_debt` dùng nhất quán ở Task 1, 2, 5. `LoanDebtRow` khớp cột RPC. Hàm `fetchLoansDebtSeries` trả `Map<string, LoanDebtRow>` dùng đúng ở Step 3.
- **Lưu ý khi execute:** sau BẤT KỲ thay đổi SQL nào (Task 1/4) phải chạy lại Task 2 (verify khớp hôm nay) — đây là cổng chặn tiền, không được bỏ.
