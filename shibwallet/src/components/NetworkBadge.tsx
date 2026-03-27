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
        className="flex items-center gap-2 px-3.5 py-1.5 glass-pill
                   hover:bg-white/10 hover:border-white/20
                   transition-all duration-200 text-sm active:scale-95 group"
      >
        {/* Animated connected pulse dot */}
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-green-400 opacity-50"
            style={{ animation: 'connected-pulse 2s ease-in-out infinite' }}
          />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400
                           shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
        </span>
        <span className="text-white font-medium">{currentNetwork?.name ?? 'Unknown'}</span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-52 glass-card p-1.5 z-50 animate-fade-in overflow-hidden">
          {networkOptions.map(([key, network]) => (
            <button
              key={key}
              onClick={() => {
                setNetwork(key);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 text-sm text-left rounded-xl
                          transition-all duration-200 active:scale-[0.98]
                ${
                  key === networkKey
                    ? 'text-white bg-gradient-to-r from-shib-orange/15 to-shib-amber/10 border border-shib-orange/20'
                    : 'text-gray-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
                }`}
            >
              <span className="relative flex h-2 w-2">
                {key === networkKey && (
                  <span className="absolute inset-0 rounded-full bg-green-400 opacity-40"
                    style={{ animation: 'connected-pulse 2s ease-in-out infinite' }}
                  />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    key === networkKey
                      ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]'
                      : 'bg-gray-500'
                  }`}
                />
              </span>
              <span className="font-medium">{network.name}</span>
              {key === networkKey && (
                <span className="ml-auto text-[10px] text-shib-orange/70 font-semibold uppercase tracking-widest">
                  Active
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkBadge;
