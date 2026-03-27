import React, { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { useNetworkStore } from '../store/networkStore';
import { getTokensForChain, TokenInfo } from '../lib/tokens';

interface TokenSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  balances: Record<string, bigint>;
}

function formatBalance(raw: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;

  if (remainder === 0n) return whole.toString();

  const fractional = remainder.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  if (!fractional) return whole.toString();
  return `${whole}.${fractional}`;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 40%)`;
}

const TokenSelectorRow: React.FC<{
  token: TokenInfo;
  balance: bigint;
  onSelect: (token: TokenInfo) => void;
  index: number;
}> = ({ token, balance, onSelect, index }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const displayBalance = formatBalance(balance, token.decimals);

  return (
    <button
      onClick={() => onSelect(token)}
      className="w-full flex items-center gap-3 px-4 py-3.5 transition-all duration-200 text-left
                 hover:bg-white/[0.04] border-l-2 border-l-transparent hover:border-l-[#FF6900]
                 border-b border-white/[0.05] last:border-b-0 active:scale-[0.98]"
      style={{
        animation: `slide-up-fade 0.3s ease-out ${index * 40}ms both`,
      }}
    >
      {/* Token logo */}
      <div className="relative w-10 h-10 shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: stringToColor(token.symbol) }}
        >
          {token.symbol.slice(0, 2)}
        </div>
        {imgLoaded && (
          <img
            src={token.logoUrl}
            alt={token.symbol}
            className="w-10 h-10 rounded-full absolute inset-0"
          />
        )}
        <img
          src={token.logoUrl}
          alt=""
          className="hidden"
          onLoad={() => setImgLoaded(true)}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{token.symbol}</p>
        <p className="text-gray-500 text-xs truncate mt-0.5">{token.name}</p>
      </div>

      <span className="text-gray-400 text-sm font-mono shrink-0 tabular-nums">
        {displayBalance}
      </span>
    </button>
  );
};

const TokenSelector: React.FC<TokenSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  balances,
}) => {
  const [search, setSearch] = useState('');
  const chainId = useNetworkStore((s) => s.chainId);
  const tokens = getTokensForChain(chainId);

  const filtered = useMemo(() => {
    if (!search.trim()) return tokens;
    const query = search.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query) ||
        t.address.toLowerCase().includes(query),
    );
  }, [tokens, search]);

  if (!isOpen) return null;

  const handleSelect = (token: TokenInfo) => {
    onSelect(token);
    setSearch('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl w-full max-w-sm mx-4 max-h-[80vh] flex flex-col animate-slide-up-fade shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-white font-semibold text-base">Select Token</h2>
          <button
            onClick={() => {
              setSearch('');
              onClose();
            }}
            className="text-gray-400 hover:text-white transition-colors active:scale-95 p-1 rounded-lg hover:bg-white/[0.06]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, symbol, or address"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]
                         text-white placeholder-gray-500 text-sm focus:outline-none
                         focus:border-[#FF6900]/50 focus:shadow-[0_0_15px_rgba(255,105,0,0.1)]
                         transition-all duration-200"
              autoFocus
            />
          </div>
        </div>

        {/* Token list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-10">No tokens found.</p>
          ) : (
            filtered.map((token, index) => (
              <TokenSelectorRow
                key={token.address}
                token={token}
                balance={balances[token.address] ?? 0n}
                onSelect={handleSelect}
                index={index}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenSelector;
