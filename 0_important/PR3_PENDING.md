# PR3 — Hoãn lại, chưa deploy

**Ngày note**: 2026-04-24

## Hiện trạng production

### ✅ Đã xong
1. **PR1** — Money-by-day báo cáo event-sourced (deployed)
2. **PR2** — Tất cả readers UI chuyển sang RPC event-sourced (deployed)
3. **Calibration** — Đã insert 15 record vào `store_fund_history` để RPC khớp `stores.cash_fund` hiện tại. UI không thấy số nhảy
4. **Cron `daily_fund_snapshot`** — Đã gỡ thủ công (ngừng snapshot `store_total_fund` hàng ngày)

### ⏸ Đã code nhưng CHƯA deploy (PR3)

Code changes đã chuẩn bị sẵn trong branch hiện tại, nhưng chưa merge/push production:

- `src/lib/store.ts` — gỡ 3 function write cash_fund
- `src/lib/storeFundHistory.ts` — gỡ 5 callsite `updateStoreCashFund`
- `src/app/total-fund/page.tsx` — gỡ `updateTotalFund` (self-heal)
- `src/components/common/FinancialSummary.tsx` — gỡ self-heal handler
- `src/hooks/useCashFundUpdater.ts` — stub no-op
- `src/components/StoreFundHistory/StoreFundHistoryForm.tsx` — gỡ dead validation
- Migration SQL: `supabase/migrations/20260424150000_drop_cash_fund_legacy.sql` — drop 5 pawn triggers + cột `stores.cash_fund` + bảng `store_total_fund`

## Tình trạng production hiện tại (sau gỡ cron)

| Thành phần | Trạng thái |
|---|---|
| UI readers | Event-sourced qua RPC — **đúng, không drift** |
| `stores.cash_fund` column | Vẫn tồn tại, vẫn bị write bởi code cũ + 5 triggers pawn. Không ai đọc nên không ảnh hưởng |
| `store_total_fund` table | Vẫn tồn tại, không còn snapshot mới (cron gỡ rồi), không ai đọc |
| 5 triggers pawn `cash_fund` | Vẫn fire mỗi giao dịch pawn — chi phí nhỏ, không tác động user |
| Cron `daily_fund_snapshot` | ❌ Đã gỡ |
| Calibration records | 15 row trong `store_fund_history`, tag `[DRIFT_CALIBRATION_2026_04_24]` |

## Tác động của việc hoãn PR3

### Không vấn đề
- User không thấy gì khác biệt
- Số liệu đúng 100% (event-sourced)
- Có thể chạy vô thời hạn ở trạng thái này

### Tech debt
- `stores.cash_fund` tiếp tục drift (Bug A/B/C vẫn active). Chỉ là dead state, không ai đọc
- `store_total_fund` table tồn tại với snapshot cũ (cron gỡ rồi nên không phình thêm)
- Dev mới đọc code có thể nhầm lẫn: "cột cash_fund có dùng không?"
- 5 triggers pawn vẫn fire (tiny overhead)

### Rủi ro nhỏ
- Nếu ai đó thêm page/hook mới đọc `stores.cash_fund` trong tương lai → bug tái phát
- Khuyến nghị: thêm comment DEPRECATED vào DB column (xem phần dưới)

## Khi nào nên deploy PR3

- Sau 2-4 tuần PR2 chạy stable, không có issue nào về số liệu
- Hoặc khi codebase cần refactor lớn → gộp PR3 vào
- Hoặc khi có dev mới join team → tránh confusion

## Cách resume deploy PR3 (khi nào sẵn sàng)

Đọc hướng dẫn đầy đủ trong conversation với Claude. Tóm tắt 5 bước:

1. `git status` check branch — code PR3 đã có sẵn
2. `git commit` + push (Vercel auto-deploy)
3. Chạy migration [supabase/migrations/20260424150000_drop_cash_fund_legacy.sql](../supabase/migrations/20260424150000_drop_cash_fund_legacy.sql) qua Supabase SQL Editor (có BEGIN/COMMIT để verify trước)
4. `npm run update-types` để regenerate types
5. Verify UI các trang

## Gợi ý tạm thời (nếu hoãn dài)

Để tránh dev mới đọc nhầm, có thể thêm comment vào DB:

```sql
COMMENT ON COLUMN stores.cash_fund IS
  'DEPRECATED 2026-04-24: KHÔNG đọc cột này. Dùng RPC calc_cash_fund_as_of(store_id) thay.
   Column sẽ bị drop trong PR3. State column bị drift, không đáng tin.';

COMMENT ON TABLE store_total_fund IS
  'DEPRECATED 2026-04-24: KHÔNG đọc bảng này. Dùng RPC calc_cash_fund_series(store_id, start, end) thay.
   Table sẽ bị drop trong PR3. Cron snapshot đã gỡ.';
```

Chạy qua Supabase SQL Editor, mất 1 giây, an toàn tuyệt đối.

## File liên quan

- [calibration_apply.sql](calibration_apply.sql) — Đã chạy production
- [calibration_rollback.sql](calibration_rollback.sql) — Nếu muốn revert calibration
- [drift_report.xlsx](../drift_report.xlsx) — Báo cáo drift theo store (snapshot tại thời điểm calibrate)
- `supabase/migrations/20260424150000_drop_cash_fund_legacy.sql` — Migration PR3 sẵn sàng chạy

## Rollback toàn bộ (emergency)

Nếu sau này muốn quay lại 100% state-based (cực kỳ không khuyến nghị):
1. Chạy [calibration_rollback.sql](calibration_rollback.sql) để gỡ 15 record calibration
2. Revert commits PR2 qua `git revert`
3. Redeploy

Nhưng sẽ quay lại với bug drift ban đầu. Tốt hơn là tiến lên PR3.
