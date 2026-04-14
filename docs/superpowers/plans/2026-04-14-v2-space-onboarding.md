# V2 Space Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay toàn bộ landing page v2 (developer portfolio) bằng website không gian giả với 3-bước hidden login flow.

**Architecture:** 3 trang độc lập (`/`, `/space/observatory`, `/space/mission-control`) dùng chung component `StarfieldBackground`. Flow: landing → click "Enter Observatory" → click card "Orion Nebula" → click button "Access Terminal" → `/login`. Cơ chế switch `NEXT_PUBLIC_BUILD_NAME` giữ nguyên.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS 4, Lucide icons, `useRouter` cho navigation.

---

## File Map

| File | Action |
|------|--------|
| `src/components/space/StarfieldBackground.tsx` | Tạo mới — starfield animation component |
| `src/app/home/v2.tsx` | Rewrite — space landing page |
| `src/app/space/observatory/page.tsx` | Tạo mới — celestial catalog page |
| `src/app/space/mission-control/page.tsx` | Tạo mới — mission control page |
| `src/app/portfolio_v2/about/page.tsx` | Xóa |
| `src/app/portfolio_v2/projects/page.tsx` | Xóa |
| `src/app/portfolio_v2/skills/page.tsx` | Xóa |

---

## Task 1: Xóa portfolio_v2

**Files:**
- Delete: `src/app/portfolio_v2/about/page.tsx`
- Delete: `src/app/portfolio_v2/projects/page.tsx`
- Delete: `src/app/portfolio_v2/skills/page.tsx`

- [ ] **Step 1: Xóa 3 file**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
rm src/app/portfolio_v2/about/page.tsx
rm src/app/portfolio_v2/projects/page.tsx
rm src/app/portfolio_v2/skills/page.tsx
rmdir src/app/portfolio_v2/about src/app/portfolio_v2/projects src/app/portfolio_v2/skills src/app/portfolio_v2
```

- [ ] **Step 2: Kiểm tra**

```bash
ls src/app/portfolio_v2 2>/dev/null && echo "STILL EXISTS" || echo "DELETED OK"
```

Expected: `DELETED OK`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove unused portfolio_v2 pages"
```

---

## Task 2: Tạo StarfieldBackground component

**Files:**
- Create: `src/components/space/StarfieldBackground.tsx`

- [ ] **Step 1: Tạo file**

```tsx
// src/components/space/StarfieldBackground.tsx
'use client';
import { useMemo } from 'react';

export function StarfieldBackground() {
  const stars = useMemo(
    () =>
      Array.from({ length: 150 }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.6 + 0.1,
        duration: Math.random() * 3 + 2,
        delay: Math.random() * 4,
      })),
    []
  );

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Kiểm tra TypeScript compile**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors liên quan đến file mới.

- [ ] **Step 3: Commit**

```bash
git add src/components/space/StarfieldBackground.tsx
git commit -m "feat: add StarfieldBackground component"
```

---

## Task 3: Rewrite HomePageV2 — Space Landing

**Files:**
- Modify: `src/app/home/v2.tsx`

- [ ] **Step 1: Rewrite toàn bộ file**

```tsx
// src/app/home/v2.tsx
'use client';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { StarfieldBackground } from '@/components/space/StarfieldBackground';

export const HomePageV2 = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white relative overflow-hidden">
      <StarfieldBackground />

      {/* Header */}
      <header className="relative z-10 container mx-auto px-6 py-8">
        <nav className="flex justify-between items-center">
          <div className="text-2xl font-bold tracking-widest text-cyan-400">COSMOS</div>
          <div className="hidden md:flex space-x-8">
            <a href="#explore" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm tracking-widest uppercase">Explore</a>
            <a href="#observatory" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm tracking-widest uppercase">Observatory</a>
            <a href="#about" className="text-gray-400 hover:text-cyan-400 transition-colors text-sm tracking-widest uppercase">About</a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 container mx-auto px-6 py-32 text-center">
        <div className="max-w-4xl mx-auto">
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-4">
            Deep Space Exploration
          </p>
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-6">
            The Universe
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">
              Awaits
            </span>
          </h1>
          <p className="text-gray-400 text-xl mb-12 max-w-2xl mx-auto">
            Tracking 4,291 celestial objects across 12 known star systems
          </p>
          <button
            onClick={() => router.push('/space/observatory')}
            className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-8 py-4 transition-colors text-sm tracking-widest uppercase rounded-sm"
          >
            Enter Observatory
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 container mx-auto px-6 pb-24">
        <div className="grid grid-cols-3 gap-6 max-w-3xl mx-auto">
          {[
            { label: 'Stars Mapped', value: '2,847,391' },
            { label: 'Light Years Traveled', value: '∞' },
            { label: 'Active Missions', value: '14' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="text-center p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-sm"
            >
              <div className="text-3xl font-bold text-cyan-400 mb-2">{stat.value}</div>
              <div className="text-gray-500 text-xs tracking-widest uppercase">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
```

- [ ] **Step 2: Chạy dev server và kiểm tra trang landing**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
npm run dev
```

Mở `http://localhost:3000` (khi `NEXT_PUBLIC_BUILD_NAME` không phải `nuvoras`).

Verify:
- Nền đen, có các chấm sao nhấp nháy
- Logo "COSMOS" màu cyan bên trái
- Heading "The Universe / Awaits" với gradient
- 3 stat cards phía dưới
- Nút "Enter Observatory" — click → điều hướng tới `/space/observatory` (sẽ trả 404 ở bước này, bình thường)

- [ ] **Step 3: Commit**

```bash
git add src/app/home/v2.tsx
git commit -m "feat: rewrite HomePageV2 as space landing page"
```

---

## Task 4: Tạo Observatory page

**Files:**
- Create: `src/app/space/observatory/page.tsx`

- [ ] **Step 1: Tạo thư mục và file**

```tsx
// src/app/space/observatory/page.tsx
'use client';
import { useRouter } from 'next/navigation';
import { StarfieldBackground } from '@/components/space/StarfieldBackground';

const BADGE_STYLES: Record<string, string> = {
  ACTIVE: 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10',
  MONITORING: 'text-violet-400 border-violet-400/40 bg-violet-400/10',
  ARCHIVED: 'text-gray-500 border-gray-500/40 bg-gray-500/10',
};

const OBJECTS = [
  {
    name: 'Andromeda Galaxy',
    description: 'Spiral galaxy approximately 2.537 million light-years from Earth. Largest galaxy in the Local Group.',
    badge: 'MONITORING',
    path: null,
  },
  {
    name: 'Orion Nebula',
    description: 'Diffuse nebula situated in the Milky Way south of Orion\'s Belt. One of the most scrutinized and photographed objects in the night sky.',
    badge: 'ACTIVE',
    path: '/space/mission-control',
  },
  {
    name: 'Crab Nebula',
    description: 'Supernova remnant and pulsar wind nebula in the constellation of Taurus. Result of a supernova recorded by astronomers in 1054.',
    badge: 'ARCHIVED',
    path: null,
  },
  {
    name: 'Milky Way Core',
    description: 'The central bulge of our galaxy, containing a supermassive black hole designated Sagittarius A*.',
    badge: 'MONITORING',
    path: null,
  },
  {
    name: 'Horsehead Nebula',
    description: 'A dark nebula in the constellation Orion, part of the Orion Molecular Cloud complex.',
    badge: 'ACTIVE',
    path: null,
  },
  {
    name: 'Whirlpool Galaxy',
    description: 'An interacting grand-design spiral galaxy with a Seyfert 2 active galactic nucleus located at 23 million light-years.',
    badge: 'ARCHIVED',
    path: null,
  },
];

export default function ObservatoryPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white relative overflow-hidden">
      <StarfieldBackground />

      {/* Header */}
      <header className="relative z-10 container mx-auto px-6 py-8">
        <div className="text-2xl font-bold tracking-widest text-cyan-400">COSMOS</div>
      </header>

      {/* Content */}
      <section className="relative z-10 container mx-auto px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-2">Catalog</p>
          <h1 className="text-4xl font-bold text-white mb-2">Active Celestial Catalog</h1>
          <p className="text-gray-500 mb-12">6 objects currently under observation</p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {OBJECTS.map((obj) => (
              <div
                key={obj.name}
                onClick={() => obj.path && router.push(obj.path)}
                className={`p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-sm transition-all duration-200 hover:border-white/20 hover:bg-white/[0.07] ${obj.path ? 'cursor-pointer' : ''}`}
              >
                <div className="flex justify-between items-start mb-4 gap-2">
                  <h3 className="text-white font-semibold text-sm">{obj.name}</h3>
                  <span className={`text-xs px-2 py-1 border rounded-sm tracking-widest shrink-0 ${BADGE_STYLES[obj.badge]}`}>
                    {obj.badge}
                  </span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">{obj.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Kiểm tra trang observatory**

Mở `http://localhost:3000/space/observatory`.

Verify:
- Hiện 6 card thiên thể trong grid 3 cột
- Tất cả card trông giống nhau về style
- Click "Orion Nebula" → điều hướng tới `/space/mission-control` (sẽ 404 ở bước này)
- Click các card còn lại → không có gì xảy ra

- [ ] **Step 3: Commit**

```bash
git add src/app/space/observatory/page.tsx
git commit -m "feat: add space observatory page"
```

---

## Task 5: Tạo Mission Control page

**Files:**
- Create: `src/app/space/mission-control/page.tsx`

- [ ] **Step 1: Tạo file**

```tsx
// src/app/space/mission-control/page.tsx
'use client';
import { useRouter } from 'next/navigation';
import { StarfieldBackground } from '@/components/space/StarfieldBackground';

const TELEMETRY = [
  { label: 'Coordinates', value: 'RA 05h 35m 17s / Dec −05° 23′' },
  { label: 'Distance', value: '1,344 light-years' },
  { label: 'Last Contact', value: '14 APR 2026 — 03:42 UTC' },
  { label: 'Status', value: 'NOMINAL' },
];

const ACTIONS = [
  { label: 'View Telemetry', path: null },
  { label: 'Signal Analysis', path: null },
  { label: 'Access Terminal', path: '/login' },
  { label: 'Export Report', path: null },
];

export default function MissionControlPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white relative overflow-hidden">
      <StarfieldBackground />

      {/* Header */}
      <header className="relative z-10 container mx-auto px-6 py-8">
        <div className="text-2xl font-bold tracking-widest text-cyan-400">COSMOS</div>
      </header>

      {/* Content */}
      <section className="relative z-10 container mx-auto px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-2">Mission Control</p>
          <h1 className="text-3xl font-bold text-white mb-12">ORION NEBULA — Mission Control</h1>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Telemetry Panel */}
            <div className="p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-sm">
              <h2 className="text-xs tracking-[0.3em] uppercase text-cyan-400 mb-6">Telemetry</h2>
              <div className="space-y-1">
                {TELEMETRY.map((item) => (
                  <div
                    key={item.label}
                    className="flex justify-between items-center py-3 border-b border-white/5"
                  >
                    <span className="text-gray-500 text-xs tracking-widest uppercase">{item.label}</span>
                    <span className="text-white text-sm font-mono">{item.value}</span>
                  </div>
                ))}
                {/* Signal strength */}
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-500 text-xs tracking-widest uppercase">Signal Strength</span>
                  <div className="flex gap-1">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div
                        key={i}
                        className={`w-3 h-4 rounded-sm ${i < 6 ? 'bg-cyan-400' : 'bg-white/10'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Operations Panel */}
            <div className="p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-sm">
              <h2 className="text-xs tracking-[0.3em] uppercase text-cyan-400 mb-6">Operations</h2>
              <div className="space-y-3">
                {ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => action.path && router.push(action.path)}
                    className="w-full text-left px-6 py-4 bg-white/5 border border-white/10 text-gray-300 text-xs tracking-widest uppercase hover:border-white/20 hover:bg-white/[0.07] transition-all duration-200 rounded-sm"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Kiểm tra trang mission control**

Mở `http://localhost:3000/space/mission-control`.

Verify:
- Layout 2 cột: Telemetry bên trái, Operations bên phải
- Telemetry hiện 4 dòng data + signal strength bar (6/8 ô sáng)
- 4 button Operations trông như nhau
- Click "Access Terminal" → điều hướng tới `/login`
- Click 3 button còn lại → không có gì xảy ra

- [ ] **Step 3: Commit**

```bash
git add src/app/space/mission-control/page.tsx
git commit -m "feat: add space mission-control page"
```

---

## Task 6: Smoke test toàn bộ flow

- [ ] **Step 1: Chạy dev server (nếu chưa chạy)**

```bash
cd "/Users/dat_macbook/Documents/2025/ý tưởng mới/Dự án web tiền/credit"
npm run dev
```

- [ ] **Step 2: Test happy path (full flow)**

1. Mở `http://localhost:3000` — verify landing page space hiện ra (nền đen, sao, hero text)
2. Click **"Enter Observatory"** → verify điều hướng tới `/space/observatory`
3. Click card **"Orion Nebula"** → verify điều hướng tới `/space/mission-control`
4. Click button **"Access Terminal"** → verify điều hướng tới `/login`

- [ ] **Step 3: Test negative path (các click sai không dẫn đến login)**

1. Từ `/space/observatory`: click **"Andromeda Galaxy"**, **"Crab Nebula"**, **"Milky Way Core"**, **"Horsehead Nebula"**, **"Whirlpool Galaxy"** → không có navigation nào xảy ra
2. Từ `/space/mission-control`: click **"View Telemetry"**, **"Signal Analysis"**, **"Export Report"** → không có navigation nào xảy ra

- [ ] **Step 4: Test v1 không bị ảnh hưởng**

Set `NEXT_PUBLIC_BUILD_NAME=nuvoras` trong `.env.local`, restart dev server, mở `http://localhost:3000` → verify hiện `HomePageV1` (portfolio cũ với `/portfolio/...` links).

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build thành công, không có errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete v2 space onboarding with 3-step hidden login flow"
```
