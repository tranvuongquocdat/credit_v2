# Design: Sửa cho vay/nợ lịch sử ở báo cáo Money-by-Day (v1)

**Ngày:** 2026-07-01
**Phạm vi:** v1 (`credit/`) — báo cáo `src/app/reports/money-by-day/page.tsx`
**Loại:** Sửa bug hiển thị số tiền (money-critical) + bỏ hack

---

## 1. Vấn đề

Trang "Dòng tiền theo ngày" hiển thị cho mỗi ngày: quỹ, hoạt động, **cho vay**, **nợ**, tổng tài sản.
- Phần **quỹ** đã đúng (đã migrate sang event-sourced RPC `rpc_money_by_day_series`).
- Phần **cho vay + nợ** vẫn dùng hàm cũ `fetchLoansForDate`, và **sai cho mọi ngày ≠ hôm nay**:

| Cột | Hôm nay (đúng) | Ngày quá khứ (sai) |
|---|---|---|
| Cho vay Credit/Pawn | `Σ current_principal` (gốc + vay thêm − trả gốc) | `Σ loan_amount` (bỏ qua vay thêm/trả gốc) |
| Cho vay Trả góp | `Σ (installment_amount − đã đóng)` | `Σ (installment_amount + down_payment)` |
| Nợ (3 loại) | oldDebt thật (RPC) | **bịa = 5% × cho vay** |
| HĐ "đang chạy" | — | lọc theo **status hiện tại**, không phải status tại-ngày-đó |

**Đo trên data thật (2026-07-01):**
- Trả góp store "Nam sms" (375 HĐ active): cho vay hôm nay = **3,34 tỷ**, ngày cũ (hack) = **9,88 tỷ** → phồng **196%**.
- Tín dụng H1168: 780tr vs 790tr (lệch nhỏ hơn do ít vay thêm/trả gốc).

→ Tổng tài sản các ngày quá khứ bị phồng nặng. **Không ảnh hưởng tính lãi** (đã verify: report này không có logic lãi; biến cho vay/nợ chỉ dùng nội bộ file, không ghi DB).

## 2. Mục tiêu

Cho MỌI ngày trong dải xem, hiển thị **cho vay + nợ đúng như định nghĩa "hôm nay"** — chỉ dịch mốc thời gian về ngày đó. Không còn "nhảy bậc" tại ranh giới hôm nay.

## 3. Ràng buộc (quan trọng)

- v1 và v2 **đều chạy prod, chung DB**. → **CHỈ THÊM RPC mới. KHÔNG sửa/xoá** bất kỳ RPC/hàm cũ (`get_current_principal`, `get_old_debt`, `calc_expected_until`, ...). Được phép **gọi** chúng, không được đổi chúng.
- Money-critical: bắt buộc verify khớp trước khi tin (mục 6).

## 4. Thiết kế

### 4.1 Định nghĩa "as-of ngày X" (ĐÃ CHỐT)

**QĐ-1 — Mốc "tính đến ngày X" dùng `created_at` (ngày ghi vào hệ thống = ngày thực trả).**
- Bản ghi xuất hiện ngày nào = khách thực trả ngày đó; `effective_date` chỉ là nhãn "trả cho kỳ nào". Dòng tiền/nợ phải phản ánh ngày tiền thật về → dùng ngày ghi.
- Vì sao `created_at` chứ không `transaction_date`/`effective_date`: 2 field kia **null ở nhiều loại dòng** (đo thật: dòng `contract_close` null cả hai). `created_at` **luôn có mặt** (0 null cả 3 bảng history) → tái dựng không thủng.
- Tại X = hôm nay: `created_at <= today` gồm hết mọi dòng → **khớp đúng** số hôm nay (các RPC hiện tại không lọc ngày).

**QĐ-2 — "HĐ đang chạy tại ngày X"** = có `loan_date <= X` **VÀ** trạng thái tái dựng theo **sự kiện đóng/mở/xoá MỚI NHẤT có `created_at <= X`**:
- Sự kiện mới nhất là `contract_close` / `contract_delete` → **không chạy** (cho vay = 0).
- Sự kiện mới nhất là `contract_reopen`, hoặc **chưa có** đóng/mở/xoá nào → **đang chạy**.
- KHÔNG đọc cột `status` hiện tại.
- Lý do phải xét "mới nhất": đo thật có **100 HĐ trả góp bị mở lại (reopen)**, và dòng `contract_close` khi reopen **không** bị `is_deleted` → nếu chỉ hỏi "có contract_close không" sẽ sai (tưởng đã đóng). Xét sự kiện mới nhất mới đúng.

### 4.2 Công thức tái dựng (as-of X), tái dùng logic đã kiểm chứng

Mọi phép "tính đến X" đều lọc theo **`created_at <= X`** (QĐ-1). "Cho vay" chỉ tính cho HĐ **đang chạy tại X** (QĐ-2); HĐ không chạy → cho vay = 0, nợ = 0.

**Cho vay (chỉ HĐ đang chạy tại X):**
- Credit/Pawn: `loan_amount + Σ(additional_loan.debit − principal_repayment.credit)` với events `created_at <= X`. (Giống `get_current_principal`, thêm lọc ngày.)
- Trả góp: `installment_amount − Σ payment(credit−debit) [created_at <= X]`. (Giống định nghĩa summary hôm nay.)

**Nợ cũ:** giữ đúng công thức hiện có, thêm lọc `created_at <= X` cho các dòng payment/debt_payment:
```
old_debt(X) = expected_until( last_paid_period_trong_các_dòng_≤X ) − paid_≤X − debt_payment_≤X
```
- Credit/Pawn: `expected_until` = gọi lại **`calc_expected_until` / `calc_pawn_expected_until`** (đã nhận sẵn tham số ngày) với `last_paid_date = max(effective_date)` trong các dòng payment có `created_at <= X`.
- Trả góp: `expected = (last_paid − first_paid + 1) × installment_amount/loan_period` (first/last là `effective_date` của các dòng payment có `created_at <= X`), rồi trừ paid_≤X, debt_payment_≤X.
- Ghi chú: bounding "dòng nào đã xảy ra" = `created_at`; còn `effective_date` chỉ dùng để biết dòng đó thuộc **kỳ nào** (đúng như công thức hiện tại). Tại X=hôm nay gồm hết dòng → khớp số hôm nay.

### 4.3 Kiến trúc

- **1 RPC mới** (tên đề xuất: `rpc_money_by_day_loans_debt`) nhận `p_store_id, p_start_date, p_end_date`, trả **mỗi ngày × 6 số** (pawn/credit/installment × loan/debt).
- Tính **set-based**, loop ngày bằng `generate_series` trong SQL → **1 round-trip** cho cả dải (thay cho hiện tại: N ngày × 3+ query).
- **Tối ưu:** tránh N lần full-scan `*_history`. Dựng cumulative theo sự kiện rồi lấy mốc từng ngày (window/bucket), không quét lại toàn bảng cho mỗi ngày.

### 4.4 Frontend

- `money-by-day/page.tsx`: **bỏ hẳn** `fetchLoansForDate` + hack 5% + nhánh `isToday`.
- Dùng thẳng số từ RPC mới cho **mọi ngày kể cả hôm nay** (sau khi verify khớp) → xoá luôn "nhảy bậc".
- Không đụng file/logic nào khác (đã verify biến cho vay/nợ chỉ dùng trong file này).

## 5. Isolation

- RPC mới: input rõ (store + dải ngày), output rõ (6 số/ngày), phụ thuộc: `*_history`, `credits/pawns/installments`, `calc_*expected_until`. Test độc lập được.
- Thay đổi FE gói trong 1 file.

## 6. Verify (bắt buộc, trước khi tin)

1. Chạy RPC mới tại `X = hôm nay`, so **từng số trong 6 số** với dashboard/summary hiện tại (`useCreditsSummary`, `usePawnsSummary`, `useInstallmentsSummary`) trên **data prod thật**. Phải **khớp tới từng đồng** ở ≥3 store: Nam sms (trả góp), H1168 (tín dụng), 1 store cầm đồ.
2. Spot-check 1-2 ngày quá khứ bằng cách dựng tay từ history cho 1 HĐ, đối chiếu RPC.
3. Kiểm HĐ đã đóng: tại ngày trước khi đóng phải còn active + có cho vay; sau khi đóng = 0.

## 7. Ngoài phạm vi

- Không đổi cách tính lãi (đã đúng).
- Không đổi phần quỹ (đã đúng).
- Không tạo bảng snapshot (chưa cần; reconstruct đủ nhanh nếu set-based).

## 8. Ổn định & Rủi ro

**Ổn định (không ảnh hưởng v2 / phần khác) — đã tự soi:**
- Chỉ **THÊM** 1 RPC mới (tên riêng), **chỉ ĐỌC** bảng/hàm cũ (gọi `calc_expected_until`, không sửa). Không đổi RPC/view/bảng nào → v2 (chung DB) không bị đụng.
- Sửa code gói trong đúng 1 file v1 `money-by-day/page.tsx`. v2 (`credit_v2_gold/`) không chạm.
- Biến cho vay/nợ chỉ dùng nội bộ file này, không ghi DB → không lan sang lãi/quỹ/màn khác (đã verify).

**Rủi ro & cách chặn:**
- **Reopen (mở lại HĐ):** 100 HĐ trả góp có, và `contract_close` không bị is_deleted khi reopen → **phải** xét sự kiện đóng/mở **mới nhất** (QĐ-2), không hỏi "có contract_close không". Test riêng case này.
- **Perf** nếu viết SQL naive (N full-scan). → bắt buộc set-based, đo trên dải 30–60 ngày ở store nhiều HĐ nhất (Nam sms 1558 HĐ).
- **`created_at` & data import:** ĐÃ KIỂM (2026-07-01) — histogram `created_at` của `installment_history` tăng đều mượt (2k→17k→40k→~80k/tháng ổn định), **không có tháng dồn cục** → KHÔNG có bulk-import → `created_at` phản ánh ngày thực tế, dùng làm mốc as-of an toàn. Rủi ro này đã loại.
- **Chốt chặn cuối:** verify `RPC(hôm nay) == dashboard` tới từng đồng ở 3 store → sai là chưa ship.
