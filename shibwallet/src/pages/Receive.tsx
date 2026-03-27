import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import QRCode from '../components/QRCode';
import { useWalletStore } from '../store/walletStore';

const Receive: React.FC = () => {
  const navigate = useNavigate();
  const { address, isUnlocked } = useWalletStore();
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success('Address copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy address');
    }
  };

  if (!isUnlocked || !address) return null;

  return (
    <div className="flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      {/* Subtle background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md mx-auto w-full px-5 py-8 relative z-10">
        {/* Back button */}
        <button
          onClick={() => navigate('/wallet')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-8 active:scale-95"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-bold mb-10 text-center bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
          Receive
        </h1>

        <div className="flex flex-col items-center">
          {/* QR Code */}
          <div className="mb-8">
            <QRCode value={address} size={220} />
          </div>

          {/* Address in glass-card */}
          <div className="w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 mb-5 shadow-2xl">
            <p className="text-xs text-gray-500 mb-2 font-medium">Your Wallet Address</p>
            <p className="text-sm text-white font-mono break-all leading-relaxed">
              {address}
            </p>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl
                       bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                       text-white font-semibold transition-all duration-300 active:scale-[0.97]
                       hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]"
          >
            {copied ? (
              <>
                <Check size={18} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={18} />
                Copy Address
              </>
            )}
          </button>

          {/* Note */}
          <p className="text-xs text-gray-500 text-center mt-6 leading-relaxed max-w-xs">
            Your address is the same on all EVM chains. Only send EVM-compatible tokens to this address.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Receive;
