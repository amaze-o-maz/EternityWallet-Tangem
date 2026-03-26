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
    <div className="flex flex-col min-h-screen bg-shib-bg animate-fade-in">
      <div className="max-w-md mx-auto w-full px-4 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/wallet')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6 active:scale-95"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-bold text-white mb-8 text-center">Receive</h1>

        <div className="flex flex-col items-center">
          {/* QR Code */}
          <div className="mb-6">
            <QRCode value={address} size={220} />
          </div>

          {/* Address */}
          <div className="w-full bg-shib-surface border border-shib-border rounded-xl p-4 mb-4">
            <p className="text-xs text-gray-400 mb-2">Your Wallet Address</p>
            <p className="text-sm text-white font-mono break-all leading-relaxed">
              {address}
            </p>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover text-white font-semibold transition active:scale-95"
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
          <p className="text-xs text-gray-500 text-center mt-4 leading-relaxed">
            Your address is the same on all EVM chains. Only send EVM-compatible tokens to this address.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Receive;
