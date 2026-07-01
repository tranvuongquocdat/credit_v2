# Interest Detail Perf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Báo cáo "Chi tiết tiền lãi" load nhanh mà giữ output 100% y hệt, bằng date-scope query (cầm đồ/tín dụng) + RPC mới (trả góp) + tách 3 khối thành module.

**Architecture:** Thay "tải cả đời" bằng: pawn/credit query lọc `created_at∈kỳ OR updated_at∈kỳ`; trả góp gọi RPC additive `rpc_installment_interest_detail` (tính lũy kế ở DB). Tách 3 khối inline (~700 dòng) thành 3 module thuần; trang thành orchestrator mỏng. Chỉ THÊM RPC, không sửa RPC cũ → v2 an toàn.

**Tech Stack:** Next.js 15 + supabase-js, Supabase Postgres (RPC), Python (verify script).

**Spec:** `docs/superpowers/specs/2026-07-01-interest-detail-perf-design.md`

**Kiểm thử:** prod đọc-only; RPC additive deploy sớm an toàn. "Test" = **correctness gate so OLD vs NEW, diff=0 trên ma trận** (so ở mức multiset các dòng {contractCode, transactionType, interestAmount, transactionDate} — KHÔNG so thứ tự, vì OLD cũng không deterministic thứ tự khi trùng timestamp).

---

## File Structure
- **Create** `supabase/migrations/20260701020000_installment_interest_detail.sql` — RPC mới.
- **Create** `src/app/reports/interestDetail/lib/types.ts` — type `InterestDetailItem` (chuyển từ page).
- **Create** `src/app/reports/interestDetail/lib/fetchPawnInterestDetails.ts`
- **Create** `src/app/reports/interestDetail/lib/fetchCreditInterestDetails.ts`
- **Create** `src/app/reports/interestDetail/lib/fetchInstallmentInterestDetails.ts`
- **Modify** `src/app/reports/interestDetail/page.tsx` — gọi 3 module, giữ nguyên grouping/sort/render.
- **Create** `scripts/verify_interest_detail.py` — correctness gate.

---

## Task 1: RPC `rpc_installment_interest_detail` + deploy + verify formula

**Files:** Create `supabase/migrations/20260701020000_installment_interest_detail.sql`

- [ ] **Step 1: Viết migration**
```sql
-- Chi tiết lãi trả góp theo kỳ: mỗi HĐ trả 'lãi lũy kế đến cuối kỳ' (khớp JS interestDetail).
-- credit_amount thuần + transaction_date (timestamptz instant khớp startOfDay/endOfDay JS).
-- Chỉ HĐ có interestAtEnd <> interestAtStart. Lặp MỌI HĐ store bất kể status. ADDITIVE.
create or replace function public.rpc_installment_interest_detail(
  p_store_id uuid, p_start_date timestamptz, p_end_date timestamptz
) returns table (
  installment_id     uuid,
  contract_code      text,
  customer_name      text,
  installment_amount numeric,
  interest_through_end numeric
) language sql stable as $$
with inst as (
  select i.id, i.contract_code, i.installment_amount::numeric as amt,
         coalesce(i.down_payment,0)::numeric as down, cu.name as customer_name
  from installments i
  join employees e on e.id = i.employee_id and e.store_id = p_store_id
  left join customers cu on cu.id = i.customer_id
),
cum as (
  select i.id, i.down,
    greatest(0, coalesce(sum(ih.credit_amount) filter (where ih.transaction_date <  p_start_date), 0) - i.down) as interest_start,
    greatest(0, coalesce(sum(ih.credit_amount) filter (where ih.transaction_date <= p_end_date),   0) - i.down) as interest_end
  from inst i
  left join installment_history ih
    on ih.installment_id = i.id and ih.transaction_type = 'payment' and ih.is_deleted = false
  group by i.id, i.down
)
select i.id, i.contract_code, i.customer_name, i.amt, c.interest_end
from inst i join cum c on c.id = i.id
where c.interest_end <> c.interest_start;
$$;
```

- [ ] **Step 2: Commit**
```bash
git add supabase/migrations/20260701020000_installment_interest_detail.sql
git commit -m "feat(sql): rpc_installment_interest_detail cho report chi tiet lai (chua deploy)"
```

- [ ] **Step 3: Deploy** *(cần quyền write — bạn apply; additive, chưa ai gọi)*
Supabase SQL Editor → dán nội dung file → Run. Expected: `Success`.

- [ ] **Step 4: Verify RPC khớp công thức JS (Python replicate)** — file `scripts/verify_interest_detail.py`, hàm `verify_installment(store_id, start_iso, end_iso)`:
```python
# So RPC vs replicate JS cum: interestAtEnd = max(0, sum(credit_amount, transaction_date<=end) - down)
# interestAtStart = max(0, sum(credit_amount, transaction_date<start) - down); include neu end<>start.
def verify_installment(store_id, start_iso, end_iso, sample=None):
    rpc_rows = { r['installment_id']: r for r in rpc('rpc_installment_interest_detail',
        {'p_store_id':store_id,'p_start_date':start_iso,'p_end_date':end_iso}) }
    insts = get('installments_by_store', {'select':'id,down_payment', 'store_id':f'eq.{store_id}'})
    ids = [r['id'] for r in insts]
    if sample: ids = ids[:sample]
    mismatches = 0
    for it in insts:
        iid = it['id']
        if sample and iid not in set(ids): continue
        down = it['down_payment'] or 0
        pays = get('installment_history', {'select':'credit_amount,transaction_date',
            'installment_id':f'eq.{iid}','transaction_type':'eq.payment','is_deleted':'eq.false'})
        cs = sum((p['credit_amount'] or 0) for p in pays if p['transaction_date'] and p['transaction_date'] <  start_iso)
        ce = sum((p['credit_amount'] or 0) for p in pays if p['transaction_date'] and p['transaction_date'] <= end_iso)
        i_start = max(0, cs - down); i_end = max(0, ce - down)
        expect_in = (i_end != i_start)
        got = rpc_rows.get(iid)
        if expect_in and (not got or round(float(got['interest_through_end'])) != round(i_end)):
            print('  LECH', iid[:8], 'expect', i_end, 'got', got); mismatches += 1
        if (not expect_in) and got:
            print('  THUA (RPC co, JS ko)', iid[:8]); mismatches += 1
    print(f'  installment mismatches = {mismatches}')
    return mismatches == 0
```
Run: `cd credit && python3 -c "import sys;sys.path.insert(0,'scripts');import verify_interest_detail as v; print(v.verify_installment('55a778c4-f60d-4e77-99bc-352423e25e29','2026-06-01T00:00:00+07:00','2026-06-30T23:59:59+07:00'))"`
Expected: `installment mismatches = 0`, `True`.

- [ ] **Step 5: Commit verify skeleton**
```bash
git add scripts/verify_interest_detail.py
git commit -m "test: verify_installment cho rpc_installment_interest_detail"
```

---

## Task 2: Tách type `InterestDetailItem` ra `lib/types.ts`

**Files:** Create `src/app/reports/interestDetail/lib/types.ts`; Modify `page.tsx`

- [ ] **Step 1:** Tạo `src/app/reports/interestDetail/lib/types.ts` — copy y nguyên định nghĩa `interface InterestDetailItem { ... }` hiện có trong `page.tsx` (tìm `interface InterestDetailItem`), thêm `export`.

- [ ] **Step 2:** Trong `page.tsx`: xoá định nghĩa `interface InterestDetailItem` cũ, thêm `import { InterestDetailItem } from './lib/types';`.

- [ ] **Step 3:** Build check: `cd credit && npm run build` → PASS.

- [ ] **Step 4: Commit**
```bash
git add src/app/reports/interestDetail/lib/types.ts src/app/reports/interestDetail/page.tsx
git commit -m "refactor(interestDetail): tach InterestDetailItem ra lib/types"
```

---

## Task 3: Module `fetchPawnInterestDetails` (date-scope)

**Files:** Create `src/app/reports/interestDetail/lib/fetchPawnInterestDetails.ts`; Modify `page.tsx`

- [ ] **Step 1: Tạo module.**
Signature:
```typescript
import { supabase } from '@/lib/supabase';
import { getDisplayLabelByBuild } from '@/utils/nav-display-labels';
import { calculateCloseContractInterest as calculatePawnCloseInterest } from '@/lib/Pawns/calculate_close_contract_interest';
import { InterestDetailItem } from './types';

const fetchAllData = async (query: any, pageSize = 1000) => { /* copy verbatim từ page.tsx dòng 141-170 */ };
const calcPawnInterest = async (pawnId: string, createdAt: string) =>
  calculatePawnCloseInterest(pawnId, new Date(createdAt).toISOString().slice(0,10));

export async function fetchPawnInterestDetails(
  storeId: string, startDateObj: Date, endDateObj: Date
): Promise<InterestDetailItem[]> {
  const startDateISO = startDateObj.toISOString();
  const endDateISO = endDateObj.toISOString();
  const out: InterestDetailItem[] = [];
  // ... (khối cầm đồ move từ page.tsx, xem Step 2-3)
  return out;
}
```

- [ ] **Step 2: Move khối cầm đồ verbatim.**
Chuyển **nguyên văn** thân khối `if (selectedContractType === ... 'Cầm đồ')` trong `page.tsx` (dòng ~221 tới hết khối, trước khối tín chấp ~567) vào thân hàm. Đổi:
- Bỏ `queryPromises.push(...)` — chạy trực tiếp `await Promise.all([...])`.
- Đổi mọi `allInterestDetails.push(x)` → `out.push(x)`.
- Đổi `await calculateInterestAmount(item.pawn_id, 'Cầm đồ', item.created_at)` → `await calcPawnInterest(item.pawn_id, item.created_at)`.

- [ ] **Step 3: Thêm date filter cho 3 query tải-cả-đời** (payment, contract_close, contract_reopen). Với MỖI query đó, thêm ngay sau `.eq('transaction_type', '...')`:
```typescript
.or(`and(created_at.gte.${startDateISO},created_at.lte.${endDateISO}),and(updated_at.gte.${startDateISO},updated_at.lte.${endDateISO})`)
```
**KHÔNG** đổi query `debt_payment` (đã có `.gte/.lte created_at`).

- [ ] **Step 4:** Trong `page.tsx`, tạm thời gọi module song song với khối cũ để so (hoặc chờ Task 6). Ở đây chỉ cần build PASS: `npm run build`.

- [ ] **Step 5: Commit**
```bash
git add src/app/reports/interestDetail/lib/fetchPawnInterestDetails.ts src/app/reports/interestDetail/page.tsx
git commit -m "refactor(interestDetail): tach + date-scope fetchPawnInterestDetails"
```

---

## Task 4: Module `fetchCreditInterestDetails` (date-scope)

**Files:** Create `src/app/reports/interestDetail/lib/fetchCreditInterestDetails.ts`

- [ ] **Step 1: Tạo module** y hệt cấu trúc Task 3 nhưng cho tín chấp:
```typescript
import { calculateCloseContractInterest as calculateCreditCloseInterest } from '@/lib/Credits/calculate_close_contract_interest';
// ...
const calcCreditInterest = async (creditId: string, createdAt: string) =>
  calculateCreditCloseInterest(creditId, new Date(createdAt).toISOString().slice(0,10));
export async function fetchCreditInterestDetails(
  storeId: string, startDateObj: Date, endDateObj: Date
): Promise<InterestDetailItem[]> { /* move khối tín chấp */ }
```

- [ ] **Step 2: Move khối tín chấp verbatim** (page.tsx `if (... 'Tín chấp')`, dòng ~567 tới trước khối trả góp ~837). Đổi `allInterestDetails.push`→`out.push`, `calculateInterestAmount(item.credit_id,'Tín chấp',item.created_at)`→`calcCreditInterest(item.credit_id,item.created_at)`, `.from('credit_history')` giữ nguyên.

- [ ] **Step 3: Thêm date filter** `.or(...)` (như Task 3 Step 3) cho 3 query credit_history payment/contract_close/contract_reopen. Giữ nguyên query debt_payment.

- [ ] **Step 4:** `npm run build` PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/reports/interestDetail/lib/fetchCreditInterestDetails.ts
git commit -m "refactor(interestDetail): tach + date-scope fetchCreditInterestDetails"
```

---

## Task 5: Module `fetchInstallmentInterestDetails` (dùng RPC)

**Files:** Create `src/app/reports/interestDetail/lib/fetchInstallmentInterestDetails.ts`

- [ ] **Step 1: Tạo module gọi RPC:**
```typescript
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { InterestDetailItem } from './types';

export async function fetchInstallmentInterestDetails(
  storeId: string, startDateObj: Date, endDateObj: Date
): Promise<InterestDetailItem[]> {
  const { data, error } = await (supabase as any).rpc('rpc_installment_interest_detail', {
    p_store_id: storeId,
    p_start_date: startDateObj.toISOString(),
    p_end_date: endDateObj.toISOString(),
  });
  if (error) { console.error('rpc_installment_interest_detail', error); return []; }
  const asOf = endDateObj.toLocaleString('vi-VN');
  return (Array.isArray(data) ? data : []).map((r: any) => ({
    id: `installment-interest-${r.installment_id}-${format(endDateObj, 'yyyy-MM-dd')}`,
    contractId: r.installment_id,
    contractCode: r.contract_code || '',
    customerName: r.customer_name || '',
    itemName: 'Trả góp',
    loanAmount: r.installment_amount || 0,
    transactionDate: asOf,
    transactionDateTime: asOf,
    interestAmount: Number(r.interest_through_end) || 0,
    otherAmount: 0,
    totalAmount: Number(r.interest_through_end) || 0,
    transactionType: 'Lãi họ',
    type: 'Trả góp',
  }));
}
```
(Đối chiếu field mapping với khối trả góp cũ page.tsx dòng 902-916 — phải trùng key/format.)

- [ ] **Step 2:** `npm run build` PASS.

- [ ] **Step 3: Commit**
```bash
git add src/app/reports/interestDetail/lib/fetchInstallmentInterestDetails.ts
git commit -m "refactor(interestDetail): fetchInstallmentInterestDetails dung RPC"
```

---

## Task 6: Wire `page.tsx` gọi 3 module, xoá khối cũ

**Files:** Modify `src/app/reports/interestDetail/page.tsx`

- [ ] **Step 1:** Thêm imports:
```typescript
import { fetchPawnInterestDetails } from './lib/fetchPawnInterestDetails';
import { fetchCreditInterestDetails } from './lib/fetchCreditInterestDetails';
import { fetchInstallmentInterestDetails } from './lib/fetchInstallmentInterestDetails';
```

- [ ] **Step 2:** Thay TOÀN BỘ đoạn từ `const queryPromises... = []` tới `await Promise.all(queryPromises);` (dòng ~217-925) bằng:
```typescript
const [pawnItems, creditItems, installmentItems] = await Promise.all([
  (selectedContractType === 'all' || selectedContractType === 'Cầm đồ')
    ? fetchPawnInterestDetails(storeId, startDateObj, endDateObj) : Promise.resolve([]),
  (selectedContractType === 'all' || selectedContractType === 'Tín chấp')
    ? fetchCreditInterestDetails(storeId, startDateObj, endDateObj) : Promise.resolve([]),
  (selectedContractType === 'all' || selectedContractType === 'Trả góp')
    ? fetchInstallmentInterestDetails(storeId, startDateObj, endDateObj) : Promise.resolve([]),
]);
const allInterestDetails: InterestDetailItem[] = [...pawnItems, ...creditItems, ...installmentItems];
```
Giữ NGUYÊN phần sau (`groupedData`, sort, `setInterestDetails`). Xoá `calculateInterestAmount`, `fetchAllData`, các SELECT const nếu chỉ còn dùng trong module (kiểm bằng grep, gỡ import thừa như `calculate*CloseInterest`).

- [ ] **Step 3:** `cd credit && npm run build` PASS + `grep -n "queryPromises\|allInterestDetails.push\|calculateInterestAmount" src/app/reports/interestDetail/page.tsx` → rỗng.

- [ ] **Step 4: Commit**
```bash
git add src/app/reports/interestDetail/page.tsx
git commit -m "refactor(interestDetail): page goi 3 module, bo khoi cu tai-ca-doi"
```

---

## Task 7: Correctness gate (OLD vs NEW, ma trận, diff=0) + perf

**Files:** Modify `scripts/verify_interest_detail.py`

- [ ] **Step 1: Thêm `verify_pawn_credit(table, store_id, start_iso, end_iso)`** — so tập-dòng OLD (cả đời + predicate) vs NEW (date-scoped + predicate):
```python
def keys_from_rows(rows, start_iso, end_iso):
    # predicate JS: original neu created in [start,end]; cancel neu is_deleted and updated in [start,end]
    out = set()
    for r in rows:
        ca = r['created_at']; ua = r.get('updated_at')
        if ca and start_iso <= ca <= end_iso:
            out.add((r['id'], 'orig'))
        if r.get('is_deleted') and ua and start_iso <= ua <= end_iso:
            out.add((r['id'], 'cancel'))
    return out

def verify_pawn_credit(table, id_col, store_fk, store_id, start_iso, end_iso):
    # OLD: fetch ca doi (payment+close+reopen), NEW: fetch date-scoped, ap cung predicate
    mism = 0
    for ttype in ('payment','contract_close','contract_reopen'):
        old = get(table, {'select':f'id,created_at,updated_at,is_deleted','{store_fk}':f'eq.{store_id}','transaction_type':f'eq.{ttype}'})
        new = get(table, {'select':f'id,created_at,updated_at,is_deleted','{store_fk}':f'eq.{store_id}','transaction_type':f'eq.{ttype}',
            'or':f'(and(created_at.gte.{start_iso},created_at.lte.{end_iso}),and(updated_at.gte.{start_iso},updated_at.lte.{end_iso}))'})
        ko, kn = keys_from_rows(old,start_iso,end_iso), keys_from_rows(new,start_iso,end_iso)
        if ko != kn:
            print(f'  {table}/{ttype} LECH: chi-OLD={len(ko-kn)} chi-NEW={len(kn-ko)}'); mism += 1
    print(f'  {table} mismatches = {mism}'); return mism==0
```
(Ghi chú: `store_fk` = `pawns.store_id` / `credits.store_id`; select cần embed `pawns!inner(store_id)` để lọc — điều chỉnh param cho khớp PostgREST khi chạy.)

- [ ] **Step 2: Chạy ma trận** (main script): stores × kỳ.
```python
STORES = [('17bf2ffb-...','Nam sms'),('e6e318a5-...','H1168'),('ce1825b8-...','Linh sms'),('55a778c4-...','CD')]
PERIODS = [('2026-07-01T00:00:00+07:00','2026-07-01T23:59:59+07:00','1 ngay'),
           ('2026-06-24T00:00:00+07:00','2026-06-30T23:59:59+07:00','1 tuan'),
           ('2026-06-01T00:00:00+07:00','2026-06-30T23:59:59+07:00','1 thang'),
           ('2025-07-01T00:00:00+07:00','2026-07-01T23:59:59+07:00','ca nam'),
           ('2020-01-01T00:00:00+07:00','2020-01-02T23:59:59+07:00','ky rong')]
# for each store,period: verify_pawn_credit('pawn_history',...) + ('credit_history',...) + verify_installment(...)
# in PASS neu tat ca True
```
Run: `cd credit && python3 scripts/verify_interest_detail.py`
Expected: mọi dòng `mismatches = 0`, cuối in `OK TAT CA KHOP`.

- [ ] **Step 3: Perf — đo tay trên UI.** `cd credit && npm run dev` → `/reports/interestDetail`, store Nam sms, kỳ 1 tháng. Expected: load **nhanh hơn hẳn** (giây thay vì rất lâu); số/dòng **trùng** với bản cũ (đối chiếu vài dòng nếu còn ảnh cũ).

- [ ] **Step 4: Commit**
```bash
git add scripts/verify_interest_detail.py
git commit -m "test: correctness gate interestDetail OLD vs NEW (ma tran, diff=0)"
```

---

## Self-Review (đã chạy)
- **Spec coverage:** date-scope pawn/credit → Task 3/4 ✔; RPC trả góp → Task 1/5 ✔; tách module → Task 2-6 ✔; giữ output 100% → gate Task 7 ✔; v2 additive → Task 1 (chỉ CREATE) ✔; giữ grouping/sort → Task 6 giữ nguyên ✔.
- **Placeholder scan:** SQL + verify code cụ thể; các khối "move verbatim" chỉ rõ dòng + đổi gì (query filter, push, calc call) — không placeholder logic.
- **Type consistency:** `InterestDetailItem` 1 nguồn (Task 2); 3 module cùng signature `(storeId, startDateObj: Date, endDateObj: Date) => Promise<InterestDetailItem[]>`; RPC field `interest_through_end`/`contract_code`/`customer_name`/`installment_amount` dùng nhất quán Task 1↔5.
- **Lưu ý execute:** sau BẤT KỲ đổi query/RPC nào phải chạy lại Task 7 (gate). So multiset (không so thứ tự). Deploy RPC cần bạn apply.
