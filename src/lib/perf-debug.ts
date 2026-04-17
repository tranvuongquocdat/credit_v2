type PerfEnd = () => void;

interface PerfOptions {
  enabled?: boolean;
  context?: Record<string, unknown>;
}

const isEnabled = () => process.env.NODE_ENV === 'development';

const formatDuration = (durationMs: number) => `${(durationMs / 1000).toFixed(3)}s`;

export function startPerfTimer(label: string, options: PerfOptions = {}): PerfEnd {
  const shouldLog = options.enabled ?? isEnabled();
  if (!shouldLog) {
    return () => {};
  }

  const start = performance.now();
  const context = options.context ? ` ${JSON.stringify(options.context)}` : '';
  console.info(`[PERF][START] ${label}${context}`);

  return () => {
    const duration = performance.now() - start;
    console.info(`[PERF][END] ${label}: ${formatDuration(duration)}`);
  };
}

// Đo tổng thời gian đến khi UI đã render xong lên màn hình (sau 2 frame).
export function startScreenLoadTimer(label: string, options: PerfOptions = {}): PerfEnd {
  const endTimer = startPerfTimer(`${label}.totalScreenLoad`, options);

  return () => {
    if (typeof window === 'undefined') {
      endTimer();
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        endTimer();
      });
    });
  };
}
