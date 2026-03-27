import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWalletStore } from '../store/walletStore';

const AddressPill: React.FC = () => {
  const address = useWalletStore((s) => s.address);
  const [copied, setCopied] = useState(false);

  if (!address) return null;

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success('Address copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy address');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="group flex items-center gap-2 px-3.5 py-1.5 glass-pill
                 hover:bg-white/10 hover:border-white/20
                 hover:shadow-[0_0_20px_rgba(255,105,0,0.1)]
                 transition-all duration-200 text-sm font-mono text-white
                 active:scale-95"
      title="Click to copy address"
    >
      <span className="tracking-wide">{truncated}</span>
      <span className="transition-all duration-200 opacity-0 group-hover:opacity-100
                       -ml-1 group-hover:ml-0">
        {copied ? (
          <Check size={13} className="text-green-400" />
        ) : (
          <Copy size={13} className="text-gray-400 group-hover:text-shib-orange" />
        )}
      </span>
    </button>
  );
};

export default AddressPill;
