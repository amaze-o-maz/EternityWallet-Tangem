import React from 'react';
import { type TimedOHLC, type ChartTimeframe } from '../lib/prices';

interface CandlestickChartProps {
  data: TimedOHLC[];
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

const CandlestickChart: React.FC<CandlestickChartProps> = ({
  data,
  timeframe,
  width = 320,
  height = 150,
}) => {
  if (!data || data.length < 1) return null;

  const labelHeight = 22;
  const padding = { top: 8, right: 6, bottom: labelHeight + 6, left: 6 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let allMin = Infinity;
  let allMax = -Infinity;
  for (const [, , h, l] of data) {
    if (l < allMin) allMin = l;
    if (h > allMax) allMax = h;
  }
  const rawRange = allMax - allMin;
  // Add 5% headroom so candles don't touch edges
  const pad = rawRange * 0.05 || allMax * 0.01 || 1;
  allMin -= pad;
  allMax += pad;
  const range = allMax - allMin || 1;

  const gap = chartW / data.length;
  const candleWidth = Math.max(2.5, Math.min(14, gap * 0.7));
  const wickWidth = Math.max(1, Math.min(2, candleWidth * 0.18));

  const yScale = (price: number) =>
    padding.top + chartH - ((price - allMin) / range) * chartH;

  // X-axis labels: 4 evenly distributed
  const numLabels = Math.min(4, data.length);
  const labelData = Array.from({ length: numLabels }, (_, i) => {
    const idx = Math.floor((i / Math.max(1, numLabels - 1)) * (data.length - 1));
    return {
      x: padding.left + idx * gap + gap / 2,
      label: formatAxisLabel(data[idx][0], timeframe),
      anchor: i === 0 ? 'start' : i === numLabels - 1 ? 'end' : 'middle',
    };
  });

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
    >
      {/* Subtle baseline above labels */}
      <line
        x1={padding.left}
        y1={padding.top + chartH + 2}
        x2={width - padding.right}
        y2={padding.top + chartH + 2}
        stroke="rgba(255,255,255,0.06)"
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
        const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);

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
              rx="0.75"
            />
          </g>
        );
      })}

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

export default CandlestickChart;
