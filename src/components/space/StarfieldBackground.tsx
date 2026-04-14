'use client';
import { useMemo } from 'react';

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

export function StarfieldBackground() {
  const stars = useMemo(
    () =>
      Array.from({ length: 150 }, (_, i) => ({
        id: i,
        top: `${seededRandom(i * 6 + 0) * 100}%`,
        left: `${seededRandom(i * 6 + 1) * 100}%`,
        size: seededRandom(i * 6 + 2) * 2 + 1,
        opacity: seededRandom(i * 6 + 3) * 0.6 + 0.1,
        duration: seededRandom(i * 6 + 4) * 3 + 2,
        delay: seededRandom(i * 6 + 5) * 4,
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
