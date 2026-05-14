import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNetworkStore } from '../store/networkStore';
import { getTokensForChain, isCustomToken, removeCustomToken, TokenInfo } from '../lib/tokens';
import Sparkline from './Sparkline';

interface TokenListProps {
  balances: Record<string, bigint>;
  prices: Record<string, number>;
  sparklines?: Record<string, number[]>;
  onTokenRemoved?: () => void;
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

function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tokenBalanceToNumber(raw: bigint, decimals: number): number {
  const str = formatBalance(raw, decimals);
  return parseFloat(str) || 0;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 40%)`;
}

const TokenRow: React.FC<{
  token: TokenInfo;
  balance: bigint;
  price: number;
  sparklineData?: number[];
  index: number;
  chainId: number;
  onRemoved?: () => void;
}> = ({ token, balance, price, sparklineData, index, chainId, onRemoved }) => {
  const navigate = useNavigate();
  const [imgErrored, setImgErrored] = useState(false);

  const displayBalance = formatBalance(balance, token.decimals);
  const numericBalance = tokenBalanceToNumber(balance, token.decimals);
  const usdValue = numericBalance * price;
  const isZero = balance === 0n;

  const handleTap = () => {
    navigate(`/wallet/token/${token.address}`, {
      state: {
        token,
        balance: balance.toString(),
        price,
        sparkline: sparklineData,
      },
    });
  };

  return (
    <div
      onClick={handleTap}
      className={`flex items-center gap-3 px-4 py-3.5 transition-all duration-200 group cursor-pointer
                   hover:bg-white/[0.03] border-l-2 border-l-transparent hover:border-l-[#FF6900]
                   ${isZero ? 'opacity-50' : ''}
                   border-b border-white/[0.05] last:border-b-0`}
      style={{
        animation: `slide-up-fade 0.4s ease-out ${index * 50}ms both`,
      }}
    >
      {/* Token logo */}
      <div className="relative w-10 h-10 shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: stringToColor(token.symbol) }}
        >
          {token.symbol.slice(0, 2)}
        </div>
        {token.logoUrl && !imgErrored && (
          <img
            src={token.logoUrl}
            alt={token.symbol}
            className="w-10 h-10 rounded-full shrink-0 absolute inset-0 object-cover"
            onError={() => setImgErrored(true)}
          />
        )}
      </div>

      {/* Name + symbol */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate group-hover:text-white/90 transition-colors">{token.name}</p>
        <p className="text-gray-500 text-xs mt-0.5">{token.symbol}</p>
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length >= 2 && (
        <Sparkline data={sparklineData} />
      )}

      {/* Balance + USD value */}
      <div className="text-right shrink-0">
        <p className="text-white text-sm font-medium tabular-nums">{displayBalance}</p>
        <p className="text-gray-500 text-xs mt-0.5">{formatUsd(usdValue)}</p>
      </div>

      {/* Remove button for custom tokens */}
      {isCustomToken(chainId, token.address) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeCustomToken(chainId, token.address);
            toast.success(`${token.symbol} removed`);
            onRemoved?.();
          }}
          className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10
                     opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Remove token"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
};

const TokenList: React.FC<TokenListProps> = ({ balances, prices, sparklines, onTokenRemoved }) => {
  const chainId = useNetworkStore((s) => s.chainId);
  const tokens = getTokensForChain(chainId);

  return (
    <div>
      {tokens.map((token, index) => {
        const balance = balances[token.address] ?? 0n;
        const price = prices[token.symbol] ?? 0;

        return (
          <TokenRow
            key={token.address}
            token={token}
            balance={balance}
            price={price}
            sparklineData={sparklines?.[token.symbol]}
            index={index}
            chainId={chainId}
            onRemoved={onTokenRemoved}
          />
        );
      })}

      {tokens.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-10">
          No tokens found for this network.
        </p>
      )}
    </div>
  );
};

export default TokenList;
