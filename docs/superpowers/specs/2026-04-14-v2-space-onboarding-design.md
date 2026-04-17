# V2 Space Onboarding — Design Spec

**Date:** 2026-04-14  
**Status:** Approved

## Tổng quan

Thay toàn bộ nội dung landing page v2 (hiện là developer portfolio) bằng một website không gian giả (space theme). Mục đích: che giấu hệ thống tín dụng Nuvoras phía sau một giao diện không liên quan.

Cơ chế ẩn: người dùng phải điều hướng qua **3 trang theo đúng thứ tự**, bấm đúng element ở mỗi trang mới vào được `/login`. Không có gì "ẩn" rõ ràng — chỉ cần biết path.

## Cơ chế Switch (giữ nguyên)

`src/app/page.tsx` giữ logic hiện tại:
- `NEXT_PUBLIC_BUILD_NAME === 'nuvoras'` → `HomePageV1` (portfolio cũ, dẫn tới `/portfolio/...`)
- Else → `HomePageV2` (space theme mới)

## Flow 3 bước

```
/ (HomePageV2)
  Bấm "Enter Observatory →"
  ↓
/space/observatory
  Bấm card "Orion Nebula"
  ↓
/space/mission-control
  Bấm button "Access Terminal"
  ↓
/login
```

## Files

| File | Action |
|------|--------|
| `src/app/home/v2.tsx` | Rewrite hoàn toàn |
| `src/app/space/observatory/page.tsx` | Tạo mới |
| `src/app/space/mission-control/page.tsx` | Tạo mới |
| `src/app/portfolio_v2/about/page.tsx` | Xóa |
| `src/app/portfolio_v2/projects/page.tsx` | Xóa |
| `src/app/portfolio_v2/skills/page.tsx` | Xóa |

## Visual Style

- **Background**: `bg-[#0a0a1a]` (dark navy/near-black)
- **Stars**: CSS `@keyframes` animation — nhiều chấm trắng nhỏ kích thước khác nhau, tốc độ di chuyển ngẫu nhiên
- **Accent**: Cyan (`#06b6d4`) cho CTA và highlight + tím nhạt (`#818cf8`) cho decoration
- **Cards**: Semi-transparent (`bg-white/5`), `backdrop-blur-sm`, border `border-white/10`, glow nhẹ khi hover
- **Typography**: Chữ trắng/xám nhạt, heading dùng `tracking-widest` cho chữ nhỏ all-caps

## Trang 1: Landing (`/`)

### Header
- Logo trái: `COSMOS` (chữ trắng, bold)
- Nav phải: `Explore`, `Observatory`, `About` — scroll xuống section tương ứng trong trang, không navigate đi đâu

### Hero (center màn hình)
- Badge nhỏ all-caps: `"DEEP SPACE EXPLORATION"`
- Heading lớn: `"The Universe Awaits"`
- Sub-text: `"Tracking 4,291 celestial objects across 12 known star systems"`
- Nút CTA: **`Enter Observatory →`** → navigate tới `/space/observatory`

### Stats bar (phía dưới hero)
3 stat cards trang trí, không click được:
- `Stars Mapped` / `2,847,391`
- `Light Years Traveled` / `∞`
- `Active Missions` / `14`

### Background
Starfield animation toàn màn hình.

## Trang 2: Observatory (`/space/observatory`)

### Header
Giống landing — logo `COSMOS` + back button hoặc nav đơn giản.

### Nội dung
- Tiêu đề: `"Active Celestial Catalog"`
- Sub-title: `"6 objects currently under observation"`
- Grid 2×3, 6 card thiên thể:

| # | Tên | Badge | Click |
|---|-----|-------|-------|
| 1 | Andromeda Galaxy | `MONITORING` | Không đi đâu |
| 2 | **Orion Nebula** | `ACTIVE` | `/space/mission-control` |
| 3 | Crab Nebula | `ARCHIVED` | Không đi đâu |
| 4 | Milky Way Core | `MONITORING` | Không đi đâu |
| 5 | Horsehead Nebula | `ACTIVE` | Không đi đâu |
| 6 | Whirlpool Galaxy | `ARCHIVED` | Không đi đâu |

Mỗi card gồm: emoji/icon thiên thể, tên, 1–2 dòng mô tả fake khoa học, badge trạng thái. Tất cả 6 card trông như nhau — không có visual hint nào phân biệt Orion Nebula.

Các card không dẫn đến đâu: click vẫn có hover effect (border glow) nhưng không có `onClick` handler — không navigate, không toast.

## Trang 3: Mission Control (`/space/mission-control`)

### Header
Logo `COSMOS` + breadcrumb hoặc back link đơn giản.

### Nội dung
- Tiêu đề: `"ORION NEBULA — Mission Control"`
- Layout 2 cột:

**Cột trái — Stats Panel:**
- Coordinates: `RA 05h 35m 17s / Dec −05° 23′`
- Distance: `1,344 light-years`
- Signal Strength: `██████░░ 78%`
- Last Contact: `14 APR 2026 — 03:42 UTC`
- Status: `NOMINAL`

**Cột phải — Action Buttons (xếp dọc):**
| Button | Action |
|--------|--------|
| `View Telemetry` | Không có `onClick` — không navigate, không toast |
| `Signal Analysis` | Không có `onClick` — không navigate, không toast |
| **`Access Terminal`** | `router.push('/login')` |
| `Export Report` | Không có `onClick` — không navigate, không toast |

Tất cả 4 button trông như nhau về style — không có visual hint nào cho thấy "Access Terminal" là path thật.

## Constraints

- Không dùng external library mới — chỉ Tailwind CSS + Lucide icons (đã có sẵn)
- Starfield bằng CSS thuần (không dùng canvas hay thư viện animation)
- Responsive: mobile-friendly nhưng không cần tối ưu đặc biệt (đây là trang giả mạo, không phải sản phẩm thật)
- Không có link nào dẫn tới `/login` trực tiếp từ nav hay bất kỳ chỗ rõ ràng nào
