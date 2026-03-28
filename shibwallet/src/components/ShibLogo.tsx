import React from 'react';

interface ShibLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

const SHIB_LOGO_URL = 'https://assets.coingecko.com/coins/images/11939/standard/shiba.png';

const ShibLogo: React.FC<ShibLogoProps> = ({ size = 40, className = '', animated = false }) => {
  return (
    <img
      src={SHIB_LOGO_URL}
      alt="ShibWallet"
      width={size}
      height={size}
      className={`rounded-full ${animated ? 'animate-float' : ''} ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default ShibLogo;
