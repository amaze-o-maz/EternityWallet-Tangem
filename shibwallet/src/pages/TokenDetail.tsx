import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Copy, Check, Send, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import Sparkline from '../components/Sparkline';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useAutoLockOnResume } from '../hooks/useAutoLockOnResume';
import { type TokenInfo } from '../lib/tokens';

interface LocationState {
  token: TokenInfo;
  balance: string;
  price: number;
  sparkline?: number[];
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

function formatPrice(price: number): string {
  if (price === 0) return 'N/A';
  if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(8)}`;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 40%)`;
}

const TokenDetail: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { address: tokenAddress } = useParams<{ address: string }>();
  useAutoLockOnResume();

  const { address: walletAddress, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);

  const state = location.state as LocationState | null;
  const token = state?.token;
  const balance = state?.balance ? BigInt(state.balance) : 0n;
  const price = state?.price ?? 0;
  const sparkline = state?.sparkline;

  const [imgErrored, setImgErrored] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  if (!isUnlocked || !walletAddress || !token) {
    if (!token) navigate('/wallet', { replace: true });
    return null;
  }

  const numericBalance = parseFloat(formatBalance(balance, token.decimals)) || 0;
  const usdValue = numericBalance * price;

  const priceChange7d = sparkline && sparkline.length >= 2
    ? ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100
    : null;

  const priceChange24h = sparkline && sparkline.length >= 7
    ? (() => {
        const oneDayAgoIdx = Math.max(0, sparkline.length - Math.floor(sparkline.length / 7));
        return ((sparkline[sparkline.length - 1] - sparkline[oneDayAgoIdx]) / sparkline[oneDayAgoIdx]) * 100;
      })()
    : null;

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      toast.success('Contract address copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const explorerBase = chainId === 109
    ? 'https://www.shibariumscan.io'
    : 'https://etherscan.io';

  return (
    <div className="safe-top flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md mx-auto w-full px-5 py-8 relative z-10">
        {/* Header */}
        <button
          onClick={() => navigate('/wallet')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6 active:scale-95"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {/* Token identity */}
        <div className="flex items-center gap-4 mb-8">
          <div className="relative w-14 h-14 shrink-0">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
              style={{ backgroundColor: stringToColor(token.symbol) }}
            >
              {token.symbol.slice(0, 2)}
            </div>
            {token.logoUrl && !imgErrored && (
              <img
                src={token.logoUrl}
                alt={token.symbol}
                className="w-14 h-14 rounded-full absolute inset-0 object-cover"
                onError={() => setImgErrored(true)}
              />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{token.name}</h1>
            <p className="text-gray-400 text-sm">{token.symbol}</p>
          </div>
        </div>

        {/* Price card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 mb-4 shadow-2xl">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wider">Price</p>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-bold text-white">{formatPrice(price)}</p>
            {priceChange24h !== null && (
              <span className={`text-sm font-semibold pb-1 ${priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
                <span className="text-gray-500 font-normal ml-1">24h</span>
              </span>
            )}
          </div>
          {priceChange7d !== null && (
            <p className={`text-xs mt-1 ${priceChange7d >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
              {priceChange7d >= 0 ? '+' : ''}{priceChange7d.toFixed(2)}% past 7 days
            </p>
          )}
        </div>

        {/* Chart */}
        {sparkline && sparkline.length >= 2 && (
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 mb-4 shadow-2xl">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">7 Day Chart</p>
            <div className="flex justify-center">
              <Sparkline data={sparkline} width={300} height={120} />
            </div>
          </div>
        )}

        {/* Balance card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 mb-4 shadow-2xl">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wider">Your Balance</p>
          <p className="text-2xl font-bold text-white">
            {formatBalance(balance, token.decimals)} <span className="text-gray-400 text-base">{token.symbol}</span>
          </p>
          <p className="text-gray-400 text-sm mt-1">{formatUsd(usdValue)}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => navigate('/wallet/send', { state: { preselectedToken: token } })}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl
                       bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                       text-white text-sm font-semibold transition-all active:scale-[0.97]
                       hover:shadow-[0_0_20px_rgba(255,105,0,0.3)]"
          >
            <Send size={16} />
            Send
          </button>
          <button
            onClick={() => navigate('/wallet/swap')}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl
                       bg-white/[0.06] border border-white/[0.08]
                       text-white text-sm font-semibold transition-all active:scale-[0.97]
                       hover:bg-white/[0.1]"
          >
            <RefreshCw size={16} />
            Swap
          </button>
        </div>

        {/* Contract info */}
        {!token.isNative && (
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 shadow-2xl">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Contract</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-white font-mono break-all flex-1 leading-relaxed">
                {token.address}
              </p>
              <button
                onClick={handleCopyAddress}
                className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-all shrink-0 active:scale-95"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <a
                href={`${explorerBase}/token/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-all shrink-0"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenDetail;
