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
    description: "Diffuse nebula situated in the Milky Way south of Orion's Belt. One of the most scrutinized and photographed objects in the night sky.",
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
