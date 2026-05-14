import React from 'react';
import { type TimedOHLC, type ChartTimeframe } from '../lib/prices';

interface CandlestickChartProps {
  data: TimedOHLC[];
  timeframe: ChartTimeframe;
  width?: number;
  height?: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Adaptive label format based on the actual visible time span
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

const CandlestickChart: React.FC<CandlestickChartProps> = ({
  data,
  timeframe: _timeframe,
  width = 320,
  height = 140,
}) => {
  if (!data || data.length < 1) return null;

  const labelHeight = 20;
  const rightAxis = 54;
  const padding = { top: 8, right: rightAxis, bottom: labelHeight + 4, left: 4 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let allMin = Infinity;
  let allMax = -Infinity;
  for (const [, , h, l] of data) {
    if (l < allMin) allMin = l;
    if (h > allMax) allMax = h;
  }
  const rawRange = allMax - allMin;
  const pad = rawRange * 0.05 || allMax * 0.005 || 1;
  allMin -= pad;
  allMax += pad;
  const range = allMax - allMin || 1;

  const gap = chartW / data.length;
  const candleWidth = Math.max(2.5, Math.min(14, gap * 0.72));
  const wickWidth = Math.max(1, Math.min(2, candleWidth * 0.2));

  const yScale = (price: number) =>
    padding.top + chartH - ((price - allMin) / range) * chartH;

  const firstTs = data[0][0];
  const lastTs = data[data.length - 1][0];
  const spanMs = Math.max(1, lastTs - firstTs);

  const numLabels = data.length < 6 ? 3 : 4;
  const labelData = Array.from({ length: numLabels }, (_, i) => {
    const idx = Math.floor((i / Math.max(1, numLabels - 1)) * (data.length - 1));
    return {
      x: padding.left + idx * gap + gap / 2,
      label: formatAxisLabel(data[idx][0], spanMs),
      anchor: i === 0 ? 'start' : i === numLabels - 1 ? 'end' : 'middle',
    };
  });

  const gridLines = [0.25, 0.5, 0.75].map((frac) => ({
    y: padding.top + chartH * frac,
  }));

  const lastClose = data[data.length - 1][4];
  const lastY = yScale(lastClose);
  const lastBullish = data[data.length - 1][4] >= data[data.length - 1][1];
  const tagColor = lastBullish ? '#22c55e' : '#ef4444';

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
      style={{ overflow: 'visible' }}
    >
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

      <line
        x1={padding.left}
        y1={padding.top + chartH + 2}
        x2={width - padding.right}
        y2={padding.top + chartH + 2}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />

      {data.map((candle, i) => {
        const [, open, high, low, close] = candle;
        const bullish = close >= open;
        const color = bullish ? '#22c55e' : '#ef4444';

        const x = padding.left + i * gap + gap / 2;
        const wickTop = yScale(high);
        const wickBottom = yScale(low);

        const bodyTop = yScale(Math.max(open, close));
        const bodyBottom = yScale(Math.min(open, close));
        const bodyHeight = Math.max(2, bodyBottom - bodyTop);

        return (
          <g key={i}>
            <line
              x1={x}
              y1={wickTop}
              x2={x}
              y2={wickBottom}
              stroke={color}
              strokeWidth={wickWidth}
              strokeLinecap="round"
            />
            <rect
              x={x - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              rx="1"
            />
          </g>
        );
      })}

      <line
        x1={padding.left}
        y1={lastY}
        x2={width - padding.right}
        y2={lastY}
        stroke={tagColor}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.45"
      />
      <g>
        <rect
          x={width - padding.right + 3}
          y={lastY - 8}
          width={rightAxis - 6}
          height={16}
          fill={tagColor}
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
          {formatPriceTag(lastClose)}
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

export default CandlestickChart;
