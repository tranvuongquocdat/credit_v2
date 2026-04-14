'use client';
import { useParams, useRouter } from 'next/navigation';
import { StarfieldBackground } from '@/components/space/StarfieldBackground';

const DATA: Record<string, { type: string; description: string; stats: [string, string][] }> = {
  'andromeda-galaxy': {
    type: 'Spiral Galaxy',
    description: 'Nearest major galaxy to the Milky Way at 2.537 million light-years. Contains approximately one trillion stars.',
    stats: [['Distance', '2.537 Mly'], ['Diameter', '220,000 ly'], ['Stars', '~1 trillion'], ['Status', 'MONITORING']],
  },
  'crab-nebula': {
    type: 'Supernova Remnant',
    description: 'Stellar explosion remnant in Taurus, observed by astronomers in 1054 AD. Contains a rapidly rotating neutron star.',
    stats: [['Distance', '6,500 ly'], ['Diameter', '11 ly'], ['Age', '~971 years'], ['Status', 'ARCHIVED']],
  },
  'milky-way-core': {
    type: 'Galactic Core',
    description: 'Central bulge of our galaxy containing Sagittarius A*, a supermassive black hole of ~4 million solar masses.',
    stats: [['Distance', '26,000 ly'], ['BH Mass', '4M solar'], ['Diameter', '~1,000 ly'], ['Status', 'MONITORING']],
  },
  'horsehead-nebula': {
    type: 'Dark Nebula',
    description: 'Dark nebula in Orion, silhouetted against the bright IC 434 emission nebula. One of the most recognizable shapes in astronomy.',
    stats: [['Distance', '1,375 ly'], ['Diameter', '~3.5 ly'], ['Region', 'Orion B'], ['Status', 'ACTIVE']],
  },
  'whirlpool-galaxy': {
    type: 'Spiral Galaxy',
    description: 'Grand-design spiral galaxy interacting gravitationally with companion galaxy NGC 5195. Active star formation observed.',
    stats: [['Distance', '23 Mly'], ['Diameter', '60,000 ly'], ['Stars', '~160 billion'], ['Status', 'ARCHIVED']],
  },
  'telemetry': {
    type: 'Data Stream',
    description: 'Real-time sensor data aggregated from all active observation posts across the monitoring network.',
    stats: [['Feeds', '14 active'], ['Latency', '312 ms'], ['Uptime', '99.7%'], ['Updated', 'LIVE']],
  },
  'analysis': {
    type: 'Analysis Module',
    description: 'Spectral analysis and frequency mapping of received signal data. Processing pipeline for anomaly detection.',
    stats: [['Samples', '4,291'], ['Anomalies', '3'], ['Resolution', '0.02 nm'], ['Status', 'RUNNING']],
  },
  'report': {
    type: 'Data Export',
    description: 'Compiled mission data formatted for archival and external review. All datasets are encrypted at rest.',
    stats: [['Records', '18,472'], ['Format', 'FITS / CSV'], ['Size', '2.3 GB'], ['Status', 'READY']],
  },
};

function formatTitle(slug: string) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function SpaceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const title = formatTitle(slug);
  const data = DATA[slug];

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white relative overflow-hidden">
      <StarfieldBackground />

      <header className="relative z-10 container mx-auto px-6 py-8 flex items-center gap-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-cyan-400 text-xs tracking-widest uppercase transition-colors cursor-pointer">
          ← Back
        </button>
        <div className="text-2xl font-bold tracking-widest text-cyan-400">COSMOS</div>
      </header>

      <section className="relative z-10 container mx-auto px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <p className="text-cyan-400 text-xs tracking-[0.3em] uppercase mb-2">{data?.type ?? 'Deep Space'}</p>
          <h1 className="text-4xl font-bold text-white mb-6">{title}</h1>
          {data && (
            <>
              <p className="text-gray-400 leading-relaxed mb-12">{data.description}</p>
              <div className="p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-sm">
                <h2 className="text-xs tracking-[0.3em] uppercase text-cyan-400 mb-6">Data</h2>
                {data.stats.map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center py-3 border-b border-white/5">
                    <span className="text-gray-500 text-xs tracking-widest uppercase">{label}</span>
                    <span className="text-white text-sm font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
