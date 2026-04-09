import React, { useState } from 'react';
import { useShibName } from '../store/snsStore';

interface ShibNameProps {
  address: string;
  /** If true, show truncated address as fallback. If false, render nothing when no name. */
  fallbackTruncate?: boolean;
  /** Custom class for the name text */
  className?: string;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Displays a .shib name for an address if one exists, otherwise falls back
 * to truncated address. Tapping the name shows the full address briefly.
 */
const ShibName: React.FC<ShibNameProps> = ({ address, fallbackTruncate = true, className }) => {
  const name = useShibName(address);
  const [showAddr, setShowAddr] = useState(false);

  // Still resolving
  if (name === undefined) {
    return fallbackTruncate ? (
      <span className={`font-mono text-gray-400 ${className ?? ''}`}>{truncateAddr(address)}</span>
    ) : null;
  }

  // No name found
  if (name === null) {
    return fallbackTruncate ? (
      <span className={`font-mono text-gray-400 ${className ?? ''}`}>{truncateAddr(address)}</span>
    ) : null;
  }

  // Has a .shib name
  return (
    <span
      className={`inline-flex items-center gap-1 ${className ?? ''}`}
      onClick={() => setShowAddr((p) => !p)}
    >
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/20">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="8" cy="8" r="7" stroke="#a855f7" strokeWidth="1.5" />
          <path d="M5.5 8.5L7 10l3.5-4" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-purple-300 font-semibold text-[11px]">{name}</span>
      </span>
      {showAddr && (
        <span className="text-[10px] text-gray-500 font-mono">{truncateAddr(address)}</span>
      )}
    </span>
  );
};

export default ShibName;
