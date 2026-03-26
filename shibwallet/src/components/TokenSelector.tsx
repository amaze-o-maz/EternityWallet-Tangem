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
}> = ({ token, balance, onSelect }) => {
  const [imgError, setImgError] = useState(false);
  const displayBalance = formatBalance(balance, token.decimals);

  return (
    <button
      onClick={() => onSelect(token)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-shib-surface-alt rounded-lg
                 transition-colors text-left active:scale-95"
    >
      {imgError ? (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: stringToColor(token.symbol) }}
        >
          {token.symbol.slice(0, 2)}
        </div>
      ) : (
        <img
          src={token.logoUrl}
          alt={token.symbol}
          className="w-8 h-8 rounded-full shrink-0 bg-shib-surface-alt"
          onError={() => setImgError(true)}
        />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{token.symbol}</p>
        <p className="text-gray-500 text-xs truncate">{token.name}</p>
      </div>

      <span className="text-gray-400 text-sm font-mono shrink-0">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-shib-surface border border-shib-border rounded-xl w-full max-w-sm mx-4 max-h-[80vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-shib-border shrink-0">
          <h2 className="text-white font-semibold">Select Token</h2>
          <button
            onClick={() => {
              setSearch('');
              onClose();
            }}
            className="text-gray-400 hover:text-white transition-colors active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-shib-border shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, symbol, or address"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-shib-bg border border-shib-border
                         text-white placeholder-gray-500 text-sm focus:outline-none focus:border-shib-orange
                         transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* Token list */}
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">No tokens found.</p>
          ) : (
            filtered.map((token) => (
              <TokenSelectorRow
                key={token.address}
                token={token}
                balance={balances[token.address] ?? 0n}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenSelector;
