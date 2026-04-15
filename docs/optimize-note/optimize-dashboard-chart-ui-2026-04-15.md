# Ghi chú tối ưu — Dashboard: phần UI (biểu đồ)

**Ngày:** 2026-04-15  
**Phạm vi:** Thay đổi **tầng UI / client** quanh biểu đồ “Cho vay / Lợi nhuận” trên màn Dashboard, và **cách gọi RPC** tương ứng (không lặp lại toàn bộ SQL trong migration).

**Migration SQL (nguồn định nghĩa RPC):** [`supabase/migrations/20260415120000_store_monthly_dashboard_chart_metrics.sql`](../../supabase/migrations/20260415120000_store_monthly_dashboard_chart_metrics.sql)

---

## Mục tiêu UI

- Giữ **nguyên hình thức hiển thị**: `LineChart` (Recharts), trục `month`, hai đường `choVay` / `loiNhuan`, tooltip, loading spinner — không đổi layout hay class cho vùng chart.
- Một luồng fetch gọn: `page` gọi `fetchDashboardChartMetrics`, không còn nhiều vòng query trong `page.tsx`.

---

## 1. RPC `get_dashboard_chart_metrics` (khớp migration)

| | |
|--|--|
| **Tên** | `public.get_dashboard_chart_metrics` |
| **Chữ ký** | `(p_store_id uuid, p_from_month date, p_to_month date)` |
| **Ngôn ngữ** | `LANGUAGE sql` · `STABLE` · **`SECURITY INVOKER`** (chạy với quyền user → RLS trên `pawns`, `credits`, `employees`, … vẫn áp dụng) |
| **Mục đích** | Thay view cũ: truyền `store_id` + khoảng tháng vào từng CTE trong DB (filter sớm), một round-trip `supabase.rpc(...)`. |

**Tham số (phía client hiện tại — `dashboard-chart.ts`):**

| Tham số | Ý nghĩa |
|---------|---------|
| `p_store_id` | UUID cửa hàng đang chọn. |
| `p_from_month` | Ngày bất kỳ trong **tháng cũ nhất** cần hiển thị (chart 3 tháng → thường là **đầu tháng** cách đây 2 tháng), chuỗi `yyyy-MM-dd`. |
| `p_to_month` | Ngày bất kỳ trong **tháng mới nhất** (thường là **đầu tháng hiện tại**), `yyyy-MM-dd`. |

Trong SQL, CTE `params` chuẩn hóa `p_from_month` / `p_to_month` về **đầu tháng** theo lịch VN (`Asia/Ho_Chi_Minh`), rồi các CTE chỉ aggregate các `month_bucket` nằm trong `[from_bucket, to_bucket]`.

**Cột trả về** (migration): `month_bucket`, `cho_vay_pawn`, `cho_vay_credit`, `cho_vay_installment`, `cho_vay`, `loi_nhuan_*`, `loi_nhuan`.  
**UI chỉ dùng:** `month_bucket`, `cho_vay`, `loi_nhuan` (các cột chi tiết phục vụ báo cáo / debug sau này).

**Quyền:** `GRANT EXECUTE` cho `authenticated` và `anon` (thực tế cần session hợp lệ; RLS vẫn giới hạn dữ liệu).

---

## 2. `src/lib/dashboard-chart.ts`

| Nội dung | Ghi chú |
|----------|---------|
| `fetchDashboardChartMetrics` | `supabase.rpc('get_dashboard_chart_metrics', { p_store_id, p_from_month, p_to_month })` với `fromMonth` / `toMonth` là `format(startOfMonth(...), 'yyyy-MM-dd')`. |
| `ChartDataPoint` | `{ month, choVay, loiNhuan }` — khớp `dataKey` của `LineChart`. |
| Map 3 điểm | `[2,1,0]` tháng (cũ → mới), ghép dòng RPC theo **`yyyy-MM`** từ `month_bucket` để tránh lệch định dạng ngày. |

---

## 3. `src/app/dashboard/page.tsx`

| Nội dung | Ghi chú |
|----------|---------|
| Import `fetchDashboardChartMetrics`, `ChartDataPoint` | State `chartData` dùng cùng type. |
| `fetchChartData` | `await fetchDashboardChartMetrics(currentStore.id)` — không gọi RPC trực tiếp trong page. |
| `chartLoading`, `chartRequestIdRef`, `startPerfTimer` | Giữ loading và chống race khi đổi cửa hàng. |
| JSX `LineChart` | Không đổi: `data={chartData}`, `choVay` / `loiNhuan` / `month`. |

---

## 4. File tham chiếu nhanh

| Vai trò | Đường dẫn |
|---------|-----------|
| Định nghĩa RPC | `supabase/migrations/20260415120000_store_monthly_dashboard_chart_metrics.sql` |
| Gọi RPC + map | `src/lib/dashboard-chart.ts` |
| Điều phối fetch / state chart | `src/app/dashboard/page.tsx` |

---

## 5. Sau khi đổi migration / chữ ký RPC

1. Áp migration lên DB (Supabase local / hosted).  
2. Chạy `npm run update-types` nếu project dùng type generate cho `Database['public']['Functions']`.  
3. Giữ `dashboard-chart.ts` khớp tên RPC và tên tham số (`p_store_id`, `p_from_month`, `p_to_month`).
