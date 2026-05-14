import React from 'react';
import { type TimedPrice, type ChartTimeframe } from '../lib/prices';

interface DetailLineChartProps {
  data: TimedPrice[];
  timeframe: ChartTimeframe;
  width?: number;
  height?: number;
}

function formatAxisLabel(ts: number, timeframe: ChartTimeframe): string {
  const d = new Date(ts);
  switch (timeframe) {
    case '15M':
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    case '1H':
      return d.toLocaleTimeString('en-US', { hour: 'numeric' });
    case '1D':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '1W':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '1M':
      return d.toLocaleDateString('en-US', { month: 'short' });
    case 'ALL':
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
}

const DetailLineChart: React.FC<DetailLineChartProps> = ({
  data,
  timeframe,
  width = 320,
  height = 150,
}) => {
  if (!data || data.length < 2) return null;

  const labelHeight = 22;
  const padding = { top: 8, right: 6, bottom: labelHeight + 6, left: 6 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let min = Infinity;
  let max = -Infinity;
  for (const [, p] of data) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const rawRange = max - min;
  const pad = rawRange * 0.05 || max * 0.01 || 1;
  min -= pad;
  max += pad;
  const range = max - min || 1;

  const firstTs = data[0][0];
  const lastTs = data[data.length - 1][0];
  const tsSpan = Math.max(1, lastTs - firstTs);

  const xScale = (ts: number) =>
    padding.left + ((ts - firstTs) / tsSpan) * chartW;
  const yScale = (price: number) =>
    padding.top + chartH - ((price - min) / range) * chartH;

  const isUp = data[data.length - 1][1] >= data[0][1];
  const lineColor = isUp ? '#22c55e' : '#ef4444';
  const fillColor = isUp ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)';

  // Build polyline points
  const points = data.map(([ts, p]) => `${xScale(ts).toFixed(2)},${yScale(p).toFixed(2)}`);
  const linePath = `M ${points.join(' L ')}`;
  const fillPath = `${linePath} L ${xScale(lastTs).toFixed(2)},${padding.top + chartH} L ${xScale(firstTs).toFixed(2)},${padding.top + chartH} Z`;

  // X-axis labels: 4 evenly distributed across the time span
  const numLabels = 4;
  const labelData = Array.from({ length: numLabels }, (_, i) => {
    const fraction = i / (numLabels - 1);
    const targetTs = firstTs + fraction * tsSpan;
    return {
      x: padding.left + fraction * chartW,
      label: formatAxisLabel(targetTs, timeframe),
      anchor: i === 0 ? 'start' : i === numLabels - 1 ? 'end' : 'middle',
    };
  });

  // Unique IDs to avoid SVG ID collisions across multiple charts
  const gradientId = React.useId();

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={fillPath} fill={`url(#${gradientId})`} />

      {/* Baseline above labels */}
      <line
        x1={padding.left}
        y1={padding.top + chartH + 2}
        x2={width - padding.right}
        y2={padding.top + chartH + 2}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />

      {/* Price line */}
      <path
        d={linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* X-axis time labels */}
      {labelData.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={height - 6}
          textAnchor={l.anchor as 'start' | 'middle' | 'end'}
          fontSize="10"
          fontWeight="500"
          fill="rgba(156,163,175,0.85)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
};

export default DetailLineChart;
