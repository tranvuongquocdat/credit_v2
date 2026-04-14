'use client';
import { useRouter } from 'next/navigation';
import { StarfieldBackground } from '@/components/space/StarfieldBackground';

interface TelemetryItem {
  label: string;
  value: string;
}

interface ActionItem {
  label: string;
  path: string | null;
}

const TELEMETRY: TelemetryItem[] = [
  { label: 'Coordinates', value: 'RA 05h 35m 17s / Dec −05° 23′' },
  { label: 'Distance', value: '1,344 light-years' },
  { label: 'Last Contact', value: '14 APR 2026 — 03:42 UTC' },
  { label: 'Status', value: 'NOMINAL' },
];

const ACTIONS: ActionItem[] = [
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
                    className={`w-full text-left px-6 py-4 bg-white/5 border border-white/10 text-gray-300 text-xs tracking-widest uppercase hover:border-white/20 hover:bg-white/[0.07] transition-all duration-200 rounded-sm ${action.path ? 'cursor-pointer' : 'cursor-default'}`}
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
