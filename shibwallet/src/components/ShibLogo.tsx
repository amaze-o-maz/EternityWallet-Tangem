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
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? 'animate-float' : ''} ${className}`}
    >
      <defs>
        <clipPath id="circleClip">
          <circle cx="100" cy="100" r="88" />
        </clipPath>
        <linearGradient id="faceGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#FFA630" />
          <stop offset="100%" stopColor="#F7931A" />
        </linearGradient>
        <linearGradient id="faceGrad2" x1="0%" y1="30%" x2="100%" y2="70%">
          <stop offset="0%" stopColor="#FFB840" />
          <stop offset="50%" stopColor="#F7931A" />
          <stop offset="100%" stopColor="#E88A15" />
        </linearGradient>
      </defs>

      {/* Red circle background */}
      <circle cx="100" cy="100" r="96" fill="#E2321A" />
      <circle cx="100" cy="100" r="88" fill="#F23C1A" />

      {/* Ears — poke above the circle */}
      {/* Left ear */}
      <path d="M48 55 L68 8 L95 58 Z" fill="#F7931A" />
      <path d="M55 52 L70 18 L88 54 Z" fill="#E88A15" />
      {/* Right ear */}
      <path d="M152 55 L132 8 L105 58 Z" fill="#F7931A" />
      <path d="M145 52 L130 18 L112 54 Z" fill="#E88A15" />

      {/* Main face — clipped to circle for lower portion */}
      <g clipPath="url(#circleClip)">
        {/* Face base — big rounded shape */}
        <ellipse cx="100" cy="108" rx="68" ry="72" fill="url(#faceGrad2)" />

        {/* Darker side fur */}
        <ellipse cx="40" cy="105" rx="22" ry="40" fill="#E88A15" />
        <ellipse cx="160" cy="105" rx="22" ry="40" fill="#E88A15" />

        {/* White lower face / snout area */}
        <path
          d="M44 125 Q50 100 72 108 Q85 114 100 112 Q115 114 128 108 Q150 100 156 125 Q155 170 100 185 Q45 170 44 125 Z"
          fill="#FFFFFF"
        />

        {/* Eyes — angry/squinty style like the real logo */}
        {/* Left eye */}
        <path
          d="M62 88 Q72 78 86 86 Q78 96 62 88 Z"
          fill="#1A1A1A"
        />
        {/* Right eye */}
        <path
          d="M138 88 Q128 78 114 86 Q122 96 138 88 Z"
          fill="#1A1A1A"
        />

        {/* Nose — cup/bell shape */}
        <path
          d="M88 122 Q88 115 94 112 Q100 110 106 112 Q112 115 112 122 Q112 130 100 134 Q88 130 88 122 Z"
          fill="#1A1A1A"
        />

        {/* Mouth line */}
        <path
          d="M100 134 L100 142"
          stroke="#1A1A1A"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Fangs — small triangles */}
        <path d="M82 142 L87 152 L92 142" fill="#1A1A1A" />
        <path d="M108 142 L113 152 L118 142" fill="#1A1A1A" />

        {/* Mouth curve */}
        <path
          d="M78 142 Q88 148 100 142 Q112 148 122 142"
          stroke="#1A1A1A"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Cheek fur tufts */}
        <path
          d="M38 110 Q42 95 55 100 Q48 108 38 110 Z"
          fill="#F7931A"
        />
        <path
          d="M162 110 Q158 95 145 100 Q152 108 162 110 Z"
          fill="#F7931A"
        />
      </g>

      {/* Ear tips above clip — re-draw to ensure visible */}
      <path d="M48 55 L68 8 L95 58 Z" fill="#F7931A" />
      <path d="M55 50 L70 16 L88 52 Z" fill="#E88A15" />
      <path d="M152 55 L132 8 L105 58 Z" fill="#F7931A" />
      <path d="M145 50 L130 16 L112 52 Z" fill="#E88A15" />
    </svg>
  );
};

export default ShibLogo;
