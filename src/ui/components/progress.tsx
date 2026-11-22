/** Progress bar of a run: `Step n of m` is written next to it by the screen. The fill grows over 260 ms. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-300)', overflow: 'hidden' }}
    >
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'inherit', background: 'var(--primary)', transition: 'width 260ms ease-out' }} />
    </div>
  );
}
