import React from 'react';
import { type OHLCCandle } from '../lib/prices';

interface CandlestickChartProps {
  data: OHLCCandle[];
  width?: number;
  height?: number;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({
  data,
  width = 300,
  height = 120,
}) => {
  if (!data || data.length < 1) return null;

  const padding = { top: 4, bottom: 4, left: 2, right: 2 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let allMin = Infinity;
  let allMax = -Infinity;
  for (const [, h, l] of data) {
    if (l < allMin) allMin = l;
    if (h > allMax) allMax = h;
  }
  const range = allMax - allMin || 1;

  const candleWidth = Math.max(2, Math.min(8, (chartW / data.length) * 0.7));
  const gap = chartW / data.length;

  const yScale = (price: number) =>
    padding.top + chartH - ((price - allMin) / range) * chartH;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      {data.map((candle, i) => {
        const [open, high, low, close] = candle;
        const bullish = close >= open;
        const color = bullish ? '#22c55e' : '#ef4444';

        const x = padding.left + i * gap + gap / 2;
        const wickX = x;
        const wickTop = yScale(high);
        const wickBottom = yScale(low);

        const bodyTop = yScale(Math.max(open, close));
        const bodyBottom = yScale(Math.min(open, close));
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);

        return (
          <g key={i}>
            <line
              x1={wickX}
              y1={wickTop}
              x2={wickX}
              y2={wickBottom}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={x - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={bullish ? color : color}
              stroke={color}
              strokeWidth="0.5"
              rx="0.5"
            />
          </g>
        );
      })}
    </svg>
  );
};

export default CandlestickChart;
