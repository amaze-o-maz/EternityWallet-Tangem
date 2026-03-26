import React, { useState, useRef, useEffect } from 'react';
import { useNetworkStore } from '../store/networkStore';
import { NETWORKS } from '../lib/chains';

const NetworkBadge: React.FC = () => {
  const { networkKey, setNetwork } = useNetworkStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentNetwork = NETWORKS[networkKey];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const networkOptions = Object.entries(NETWORKS) as [
    'ethereum' | 'shibarium',
    typeof NETWORKS[string],
  ][];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-shib-surface border border-shib-border
                   hover:border-shib-orange/50 transition-colors text-sm active:scale-95"
      >
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-white">{currentNetwork?.name ?? 'Unknown'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-shib-surface border border-shib-border rounded-lg shadow-xl z-50 animate-fade-in overflow-hidden">
          {networkOptions.map(([key, network]) => (
            <button
              key={key}
              onClick={() => {
                setNetwork(key);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors active:scale-95
                ${
                  key === networkKey
                    ? 'text-shib-orange bg-shib-surface-alt'
                    : 'text-white hover:bg-shib-surface-alt'
                }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  key === networkKey ? 'bg-green-500' : 'bg-gray-500'
                }`}
              />
              {network.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkBadge;
