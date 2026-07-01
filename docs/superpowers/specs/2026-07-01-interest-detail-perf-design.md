# Design: Tăng tốc báo cáo "Chi tiết tiền lãi" (interestDetail) — v1

**Ngày:** 2026-07-01
**Phạm vi:** v1 (`credit/`) — `src/app/reports/interestDetail/page.tsx`
**Loại:** Perf refactor, **giữ output 100% y hệt**

---

## 1. Vấn đề

Báo cáo chi tiết tiền lãi load **rất lâu** (các report khác nhanh). Nguyên nhân, xác nhận từ code:

1. **Tải TOÀN BỘ lịch sử, bỏ lọc theo kỳ** (thủ phạm chính). Query payment/close/reopen của pawn_history + credit_history + installment_history **không** filter ngày (comment code: *"Get ALL payment records, not just in date range"*). Ví dụ H1168 tín dụng: **2.923 dòng payment** cả đời; trả góp (Nam sms): **hàng trăm nghìn dòng** — kéo về rồi mới lọc/tính trong JS.
2. **N+1 (nhỏ)**: mỗi dòng **close/reopen** gọi `calculateInterestAmount` = ~3 query DB. Chỉ áp cho close/reopen (payment lấy `credit_amount` trực tiếp), nên N nhỏ — không phải thủ phạm chính, nhưng date-scope sẽ tự thu nó về "trong kỳ".

## 2. Cơ chế hiện tại phải GIỮ NGUYÊN

Report chọn 1 kỳ, hiển thị (đã đọc code):
- **Giao dịch phát sinh trong kỳ**: lọc theo `created_at ∈ [start,end]` (payment → dòng đóng lãi; close → "Chuộc đồ"; reopen…).
- **Giao dịch bị hủy trong kỳ**: lọc theo `updated_at ∈ [start,end]` + `is_deleted` → dòng "Huỷ đóng lãi" (interest âm). **Đây là lý do phải tải cả đời** — hủy có thể đụng dòng tạo từ lâu.
- **Trả góp**: gộp theo HĐ, tính `interestAtEnd = max(0, Σcredit(transaction_date ≤ end) − down_payment)` và `interestAtStart = max(0, Σcredit(transaction_date < start) − down_payment)`; **chỉ hiện HĐ có `interestAtEnd ≠ interestAtStart`**, và **giá trị hiển thị = `interestAtEnd`** (lãi lũy kế đến cuối kỳ, KHÔNG phải delta). Dùng **`credit_amount`** thuần (không trừ debit).

## 3. Thiết kế (Hướng A + tách module)

`interestDetail/page.tsx` → gọi **song song** 3 hàm module → gộp → render (trang thành orchestrator mỏng).

### 3.1 `fetchPawnInterestDetails(storeId, start, end)` → InterestDetailItem[]
- Tách 4 query pawn_history hiện tại ra file riêng.
- **Thêm filter ngày CHỈ cho 3 query đang tải-cả-đời** (payment, contract_close, contract_reopen): `created_at ∈ kỳ OR updated_at ∈ kỳ` — bắt cả giao dịch mới (created) lẫn hủy-trong-kỳ (updated).
- **Query debt_payment GIỮ NGUYÊN** filter `created_at ∈ kỳ` hiện có (nó không có dòng-hủy, đã scoped sẵn). KHÔNG áp "created OR updated" cho nó (kẻo đổi hành vi).
- Giữ **nguyên 100%** logic map phía sau (original/hủy/close/close-cancel/reopen/reopen-cancel/debt). `calculateInterestAmount` chỉ chạy cho close/reopen **trong kỳ** (ít).

### 3.2 `fetchCreditInterestDetails(storeId, start, end)` → InterestDetailItem[]
- Y hệt 3.1 cho credit_history.

### 3.3 `fetchInstallmentInterestDetails(storeId, start, end)` → InterestDetailItem[]
- Thay "tải cả đời + tính JS" bằng **RPC mới (additive)** `rpc_installment_interest_detail`:
  ```
  rpc_installment_interest_detail(p_store_id uuid, p_start_date timestamptz, p_end_date timestamptz)
  → (installment_id uuid, contract_code text, customer_name text,
     installment_amount numeric, interest_through_end numeric)
  ```
  (Params là **timestamptz** — frontend truyền `startDateObj.toISOString()`/`endDateObj.toISOString()`, đúng instant JS đang so, tránh lệch tz.)
  Công thức **khớp đúng JS**: per-HĐ của store (join employees),
  `cum_before = Σ credit_amount (payment, is_deleted=false, transaction_date < p_start_date)`,
  `cum_end    = Σ credit_amount (payment, is_deleted=false, transaction_date <= p_end_date)`,
  `interestAtStart = greatest(0, cum_before − down_payment)`,
  `interestAtEnd   = greatest(0, cum_end − down_payment)`,
  **chỉ trả HĐ `interestAtEnd <> interestAtStart`**, `interest_through_end = interestAtEnd`.
  (Dùng `credit_amount` thuần + `transaction_date` — KHÔNG như `get_installment_interest_for_date_range` cũ, nên phải RPC MỚI, không sửa cái cũ.)
- **RPC lặp MỌI HĐ của store bất kể status** (join installments↔employees inner, KHÔNG lọc status/deleted) — khớp JS cũ (JS fetch payment theo store, không lọc status HĐ). `transaction_date` null → loại khỏi cả 2 tổng (khớp `p.transaction_date && …` của JS).
- JS map kết quả → dòng "Lãi họ" (transactionDate = end, id = `installment-interest-{id}-{end}`), giữ y format cũ.

## 4. Ổn định / không ảnh hưởng v2

- Sửa code **gói trong v1** (`credit/`): `interestDetail/page.tsx` + module mới. **v2 repo riêng** → không chạm.
- **Chỉ THÊM 1 RPC mới** (tên riêng), chỉ ĐỌC, **không sửa RPC cũ** (kể cả `get_installment_interest_for_date_range`). → v2 (chung DB) không ảnh hưởng.
- Không đổi giao diện/nhãn/cột hiển thị.

## 5. Correctness gate (BẮT BUỘC — "không lệch bất kỳ case nào")

Tách module cho phép chạy logic ngoài React. Script `scripts/verify_interest_detail.py`:

**So OLD vs NEW trên MA TRẬN (store × kỳ × case), diff từng dòng/từng số. Lệch 1 dòng = fail.**

- **OLD** = query cả đời + áp filter JS (replicate) → tập dòng.
- **NEW** = query date-scoped (pawn/credit) + RPC (trả góp) → tập dòng.
- So khớp: cùng số dòng, cùng `{contractCode, transactionType, interestAmount, transactionDate}` mỗi dòng.

**Ma trận phải phủ:**
- Stores: Nam sms (trả góp nặng), H1168 (tín dụng + đảo), Linh sms, CD (nhỏ).
- Kỳ: 1 ngày (default), 1 tuần, 1 tháng, cả năm, kỳ rỗng (không giao dịch).
- Case bắt buộc có mặt: (a) **hủy đóng lãi của dòng tạo TRƯỚC kỳ nhưng updated trong kỳ**; (b) close/reopen (đảo) trong kỳ; (c) HĐ tạo giữa kỳ; (d) HĐ trả thừa (interest âm/0); (e) kỳ không có gì.

**Lưu ý kỹ thuật của gate (để so đúng):**
- **Mốc ngày phải trùng JS:** script replicate `startOfDay/endOfDay` theo cùng timezone (VN, UTC+7) và so cùng instant với `startDateISO/endDateISO` code dùng — kẻo lệch ranh giới ngày.
- **So ở mức tập-dòng đã-lọc** (robust): OLD = (rows cả đời) áp đúng predicate JS (`created∈kỳ` cho gốc; `is_deleted && updated∈kỳ` cho hủy); NEW = (rows date-scoped) áp cùng predicate. Không cần chép lại toàn bộ map — chỉ so key `{contractCode, transactionType, interestAmount, transactionDate}`.
- **Store lớn (Nam sms):** OLD-path (fetch cả đời) sẽ chậm — chấp nhận chạy 1 lần; hoặc verify trả góp theo **mẫu N HĐ** (Python replicate cum vs RPC cho đúng N HĐ đó). Store nhỏ (CD/Linh/H1168) verify đầy đủ.

**Chốt:** chỉ merge khi ma trận **diff = 0 toàn bộ**.

## 6. Ngoài phạm vi
- Không đổi hiển thị/nhãn/Excel export.
- Không refactor ngoài 3 khối fetch.
- Không sửa RPC/logic khác.

## 7. Rủi ro & chặn
- **Filter `created OR updated`**: cú pháp PostgREST `.or(and(...),and(...))` + `updated_at` null (dòng chưa sửa) → nhánh created vẫn bắt. Chặn bằng correctness gate case (a).
- **RPC trả góp lệch JS** (debit vs không, transaction_date null) → RPC dùng `credit_amount` thuần + `transaction_date`, khớp JS; chặn bằng gate.
- **Deploy RPC** cần quyền write (bạn apply); additive nên an toàn, chưa ai gọi tới khi chưa sửa FE.
