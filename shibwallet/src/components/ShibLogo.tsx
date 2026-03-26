import React from 'react';

interface ShibLogoProps {
  size?: number;
  className?: string;
}

const ShibLogo: React.FC<ShibLogoProps> = ({ size = 40, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Black circle background */}
      <circle cx="50" cy="50" r="50" fill="#0D0D0D" />
      <circle cx="50" cy="50" r="47" fill="#1A1A1A" stroke="#FF6900" strokeWidth="2" />

      {/* Left ear */}
      <path
        d="M25 38 L30 18 L40 32 Z"
        fill="#FF6900"
      />
      <path
        d="M28 34 L31 22 L37 32 Z"
        fill="#CC5500"
      />

      {/* Right ear */}
      <path
        d="M75 38 L70 18 L60 32 Z"
        fill="#FF6900"
      />
      <path
        d="M72 34 L69 22 L63 32 Z"
        fill="#CC5500"
      />

      {/* Face shape */}
      <ellipse cx="50" cy="52" rx="26" ry="28" fill="#FF6900" />

      {/* Inner face / cheeks */}
      <ellipse cx="50" cy="55" rx="22" ry="23" fill="#FF8C00" />

      {/* Snout */}
      <ellipse cx="50" cy="62" rx="14" ry="12" fill="#FFB366" />

      {/* Nose */}
      <ellipse cx="50" cy="58" rx="5" ry="3.5" fill="#1A1A1A" />

      {/* Mouth */}
      <path
        d="M46 62 Q50 67 54 62"
        stroke="#1A1A1A"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Left eye */}
      <ellipse cx="39" cy="46" rx="4.5" ry="5" fill="#1A1A1A" />
      <ellipse cx="40" cy="45" rx="1.5" ry="2" fill="#FFFFFF" />

      {/* Right eye */}
      <ellipse cx="61" cy="46" rx="4.5" ry="5" fill="#1A1A1A" />
      <ellipse cx="62" cy="45" rx="1.5" ry="2" fill="#FFFFFF" />

      {/* Eyebrow marks */}
      <path
        d="M33 40 Q39 36 44 40"
        stroke="#CC5500"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M56 40 Q61 36 67 40"
        stroke="#CC5500"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
};

export default ShibLogo;
