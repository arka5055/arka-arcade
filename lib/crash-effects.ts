export interface CrashFragment {
  angle: number;
  speed: number;
  size: number;
  spin: number;
  color: string;
}

export interface CrashEffect {
  x: number;
  y: number;
  elapsed: number;
  duration: number;
  fragments: CrashFragment[];
}

const fragmentColors = ['#ffffff', '#d9eef7', '#ffcf4a', '#ff6b35', '#ff3d71', '#546a7a'];

/** Creates a deterministic, lightweight visual-only explosion; no particles are simulated in React state. */
export function createCrashEffect(x: number, y: number): CrashEffect {
  const fragments = Array.from({ length: 18 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 18 + (index % 3) * 0.12,
    speed: 45 + (index % 5) * 12,
    size: 3 + (index % 4) * 1.7,
    spin: (index % 2 ? 1 : -1) * (2 + (index % 3)),
    color: fragmentColors[index % fragmentColors.length],
  }));
  return { x, y, elapsed: 0, duration: 1.35, fragments };
}

export function getCrashProgress(effect: CrashEffect): number {
  return Math.min(Math.max(effect.elapsed / effect.duration, 0), 1);
}
