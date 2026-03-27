import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  value: string;
  size?: number;
}

const QRCode: React.FC<QRCodeProps> = ({ value, size = 200 }) => {
  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Subtle orange glow behind QR */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: 'radial-gradient(circle, rgba(255, 105, 0, 0.12) 0%, transparent 70%)',
          transform: 'scale(1.3)',
          filter: 'blur(20px)',
        }}
      />
      {/* Glass card container */}
      <div className="relative rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] p-6 shadow-2xl">
        <QRCodeSVG
          value={value}
          size={size}
          bgColor="#0D0D0D"
          fgColor="#FF6900"
          level="M"
          includeMargin={false}
        />
      </div>
    </div>
  );
};

export default QRCode;
