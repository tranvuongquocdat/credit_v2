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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
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
