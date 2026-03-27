import React, { useState } from 'react';
import { useNetworkStore } from '../store/networkStore';
import { getTokensForChain, TokenInfo } from '../lib/tokens';

interface TokenListProps {
  balances: Record<string, bigint>;
  prices: Record<string, number>;
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
  index: number;
}> = ({ token, balance, price, index }) => {
  const [imgLoaded, setImgLoaded] = useState(false);

  const displayBalance = formatBalance(balance, token.decimals);
  const numericBalance = tokenBalanceToNumber(balance, token.decimals);
  const usdValue = numericBalance * price;
  const isZero = balance === 0n;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 transition-all duration-200 group
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
        {imgLoaded && (
          <img
            src={token.logoUrl}
            alt={token.symbol}
            className="w-10 h-10 rounded-full shrink-0 absolute inset-0"
          />
        )}
        <img
          src={token.logoUrl}
          alt=""
          className="hidden"
          onLoad={() => setImgLoaded(true)}
        />
      </div>

      {/* Name + symbol */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate group-hover:text-white/90 transition-colors">{token.name}</p>
        <p className="text-gray-500 text-xs mt-0.5">{token.symbol}</p>
      </div>

      {/* Balance + USD value */}
      <div className="text-right shrink-0">
        <p className="text-white text-sm font-medium tabular-nums">{displayBalance}</p>
        <p className="text-gray-500 text-xs mt-0.5">{formatUsd(usdValue)}</p>
      </div>
    </div>
  );
};

const TokenList: React.FC<TokenListProps> = ({ balances, prices }) => {
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
            index={index}
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
