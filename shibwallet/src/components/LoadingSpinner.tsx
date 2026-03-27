import React from 'react';

interface LoadingSpinnerProps {
  size?: number;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 24 }) => {
  const id = `spinner-gradient-${size}`;
  const glowId = `spinner-glow-${size}`;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Outer ambient glow ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255, 105, 0, 0.25) 0%, rgba(255, 105, 0, 0.08) 40%, transparent 70%)',
          transform: 'scale(2)',
          animation: 'pulse-glow 2s ease-in-out infinite',
        }}
      />

      {/* Secondary pulsing ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: '1px solid rgba(255, 105, 0, 0.15)',
          transform: 'scale(1.6)',
          animation: 'connected-pulse 2s ease-in-out infinite',
        }}
      />

      {/* Main spinner SVG */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-spin relative z-10"
      >
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF6900" stopOpacity="1" />
            <stop offset="50%" stopColor="#FFB800" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FF6900" stopOpacity="0" />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth="2"
          fill="none"
        />

        {/* Subtle inner track */}
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="rgba(255, 105, 0, 0.06)"
          strokeWidth="2"
          fill="none"
          strokeDasharray="2 4"
        />

        {/* Gradient arc with glow */}
        <path
          d="M12 2 A10 10 0 0 1 22 12"
          stroke={`url(#${id})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          filter={`url(#${glowId})`}
        />
      </svg>
    </div>
  );
};

export default LoadingSpinner;
