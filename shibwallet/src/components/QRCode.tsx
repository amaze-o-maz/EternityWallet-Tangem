import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  value: string;
  size?: number;
}

const QRCode: React.FC<QRCodeProps> = ({ value, size = 200 }) => {
  return (
    <div className="inline-flex items-center justify-center rounded-xl bg-shib-bg border border-shib-border p-4">
      <QRCodeSVG
        value={value}
        size={size}
        bgColor="#0D0D0D"
        fgColor="#FF6900"
        level="M"
        includeMargin={false}
      />
    </div>
  );
};

export default QRCode;
