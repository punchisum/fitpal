// Pure inline SVG sparkline — no client JS needed.
export function Sparkline({ points, width = 280, height = 64 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <p className="hint">Not enough data yet — log a few days to see your trend.</p>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="mt-2" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="#10b981" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill="#059669" />)}
    </svg>
  );
}
