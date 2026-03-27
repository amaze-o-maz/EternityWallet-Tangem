import React from 'react';

interface ShibLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

const ShibLogo: React.FC<ShibLogoProps> = ({ size = 40, className = '', animated = false }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? 'animate-float' : ''} ${className}`}
    >
      <defs>
        {/* Orange radial gradient for face depth */}
        <radialGradient id="shib-face-grad" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#FF8C00" />
          <stop offset="100%" stopColor="#FF6900" />
        </radialGradient>
        {/* Snout gradient */}
        <radialGradient id="shib-snout-grad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFE0B2" />
          <stop offset="100%" stopColor="#FFD699" />
        </radialGradient>
        {/* Subtle drop shadow */}
        <filter id="shib-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>

      <g filter="url(#shib-shadow)">
        {/* Left ear - outer */}
        <path
          d="M22 42 L28 10 L44 36 Z"
          fill="#FF6900"
        />
        {/* Left ear - inner */}
        <path
          d="M26 38 L30 17 L40 34 Z"
          fill="#CC5500"
        />

        {/* Right ear - outer */}
        <path
          d="M78 42 L72 10 L56 36 Z"
          fill="#FF6900"
        />
        {/* Right ear - inner */}
        <path
          d="M74 38 L70 17 L60 34 Z"
          fill="#CC5500"
        />

        {/* Head / face - main shape */}
        <ellipse cx="50" cy="55" rx="31" ry="33" fill="url(#shib-face-grad)" />

        {/* Cheek fur / inner face */}
        <ellipse cx="50" cy="57" rx="27" ry="28" fill="#FF8C00" />

        {/* Left cheek tuft */}
        <ellipse cx="27" cy="56" rx="9" ry="11" fill="#FF6900" />
        {/* Right cheek tuft */}
        <ellipse cx="73" cy="56" rx="9" ry="11" fill="#FF6900" />

        {/* Snout / muzzle area - cream colored */}
        <ellipse cx="50" cy="64" rx="17" ry="15" fill="url(#shib-snout-grad)" />

        {/* Forehead mark - lighter streak */}
        <path
          d="M44 35 Q50 27 56 35 Q53 41 50 43 Q47 41 44 35 Z"
          fill="#FFD699"
          opacity="0.5"
        />

        {/* Nose - triangular, slightly larger for clarity */}
        <path
          d="M44 59 L50 54 L56 59 Q50 63 44 59 Z"
          fill="#1A1A1A"
        />
        {/* Nose highlight */}
        <ellipse cx="49" cy="56.5" rx="2" ry="1.2" fill="#333" opacity="0.5" />

        {/* Mouth line */}
        <path
          d="M50 62 L50 65"
          stroke="#1A1A1A"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M43 66 Q50 72 57 66"
          stroke="#1A1A1A"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Left eye - outer */}
        <ellipse cx="38" cy="48" rx="5.5" ry="6" fill="#1A1A1A" />
        {/* Left eye - highlight */}
        <ellipse cx="39.5" cy="46" rx="2" ry="2.5" fill="#FFFFFF" />
        {/* Left eye - small highlight */}
        <circle cx="36" cy="49.5" r="1" fill="#FFFFFF" opacity="0.5" />

        {/* Right eye - outer */}
        <ellipse cx="62" cy="48" rx="5.5" ry="6" fill="#1A1A1A" />
        {/* Right eye - highlight */}
        <ellipse cx="63.5" cy="46" rx="2" ry="2.5" fill="#FFFFFF" />
        {/* Right eye - small highlight */}
        <circle cx="60" cy="49.5" r="1" fill="#FFFFFF" opacity="0.5" />

        {/* Eyebrow marks */}
        <path
          d="M30 42 Q38 36 45 42"
          stroke="#CC5500"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M55 42 Q62 36 70 42"
          stroke="#CC5500"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />

        {/* Tongue - subtle */}
        <ellipse cx="50" cy="71" rx="3.5" ry="3" fill="#FF8888" opacity="0.7" />
      </g>
    </svg>
  );
};

export default ShibLogo;
