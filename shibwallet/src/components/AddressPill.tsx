import React from 'react';
import toast from 'react-hot-toast';
import { useWalletStore } from '../store/walletStore';

const AddressPill: React.FC = () => {
  const address = useWalletStore((s) => s.address);

  if (!address) return null;

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Address copied to clipboard');
    } catch {
      toast.error('Failed to copy address');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 rounded-full bg-shib-surface border border-shib-border
                 hover:border-shib-orange/50 transition-colors text-sm text-white font-mono
                 active:scale-95"
      title="Click to copy address"
    >
      {truncated}
    </button>
  );
};

export default AddressPill;
