import React from 'react';
import { type TimedPrice, type ChartTimeframe } from '../lib/prices';

interface DetailLineChartProps {
  data: TimedPrice[];
  timeframe: ChartTimeframe;
  width?: number;
  height?: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function formatAxisLabel(ts: number, spanMs: number): string {
  const d = new Date(ts);
  if (spanMs <= 4 * HOUR) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (spanMs <= 2 * DAY) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric' });
  }
  if (spanMs <= 14 * DAY) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
  if (spanMs <= 60 * DAY) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // For longer spans, always include the year so user knows what period
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatPriceTag(price: number): string {
  if (price >= 1000) return `$${price.toFixed(0)}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(8)}`;
}

const DetailLineChart: React.FC<DetailLineChartProps> = ({
  data,
  timeframe: _timeframe,
  width = 320,
  height = 140,
}) => {
  if (!data || data.length < 2) return null;

  const labelHeight = 20;
  const rightAxis = 54;
  const padding = { top: 8, right: rightAxis, bottom: labelHeight + 4, left: 4 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let min = Infinity;
  let max = -Infinity;
  for (const [, p] of data) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const rawRange = max - min;
  const pad = rawRange * 0.05 || max * 0.005 || 1;
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

  const firstPrice = data[0][1];
  const lastPrice = data[data.length - 1][1];
  const isUp = lastPrice >= firstPrice;
  const lineColor = isUp ? '#22c55e' : '#ef4444';
  const fillTop = isUp ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)';

  const points = data.map(([ts, p]) => `${xScale(ts).toFixed(2)},${yScale(p).toFixed(2)}`);
  const linePath = `M ${points.join(' L ')}`;
  const fillPath = `${linePath} L ${xScale(lastTs).toFixed(2)},${padding.top + chartH} L ${xScale(firstTs).toFixed(2)},${padding.top + chartH} Z`;

  const numLabels = 4;
  const labelData = Array.from({ length: numLabels }, (_, i) => {
    const fraction = i / (numLabels - 1);
    const targetTs = firstTs + fraction * tsSpan;
    return {
      x: padding.left + fraction * chartW,
      label: formatAxisLabel(targetTs, tsSpan),
      anchor: i === 0 ? 'start' : i === numLabels - 1 ? 'end' : 'middle',
    };
  });

  const gridLines = [0.25, 0.5, 0.75].map((frac) => ({
    y: padding.top + chartH * frac,
  }));

  const lastY = yScale(lastPrice);

  const gradientId = React.useId();

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      {gridLines.map((g, i) => (
        <line
          key={`grid-${i}`}
          x1={padding.left}
          y1={g.y}
          x2={width - padding.right}
          y2={g.y}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
      ))}

      <path d={fillPath} fill={`url(#${gradientId})`} />

      <line
        x1={padding.left}
        y1={padding.top + chartH + 2}
        x2={width - padding.right}
        y2={padding.top + chartH + 2}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />

      <path
        d={linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Current price marker dot */}
      <circle
        cx={xScale(lastTs)}
        cy={lastY}
        r="3"
        fill={lineColor}
        stroke="#0a0a0a"
        strokeWidth="1.5"
      />

      {/* Current price line + tag on right */}
      <line
        x1={padding.left}
        y1={lastY}
        x2={width - padding.right}
        y2={lastY}
        stroke={lineColor}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.4"
      />
      <g>
        <rect
          x={width - padding.right + 3}
          y={lastY - 8}
          width={rightAxis - 6}
          height={16}
          fill={lineColor}
          rx="3"
        />
        <text
          x={width - padding.right + 3 + (rightAxis - 6) / 2}
          y={lastY + 4}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="#0a0a0a"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {formatPriceTag(lastPrice)}
        </text>
      </g>

      {labelData.map((l, i) => (
        <text
          key={`tlabel-${i}`}
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
