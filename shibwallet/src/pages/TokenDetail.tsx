import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Copy, Check, Send, RefreshCw, BarChart3, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import DetailLineChart from '../components/DetailLineChart';
import CandlestickChart from '../components/CandlestickChart';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useAutoLockOnResume } from '../hooks/useAutoLockOnResume';
import { type TokenInfo } from '../lib/tokens';
import {
  resolveGeckoId,
  fetchLineChart,
  fetchCandles,
  LIVE_REFRESH_MS,
  type ChartTimeframe,
  type TimedPrice,
  type TimedOHLC,
} from '../lib/prices';

interface LocationState {
  token: TokenInfo;
  balance: string;
  price: number;
  sparkline?: number[];
}

type ChartMode = 'line' | 'candle';

const TIMEFRAMES: { key: ChartTimeframe; label: string }[] = [
  { key: '15M', label: '15m' },
  { key: '1H', label: '1H' },
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: 'ALL', label: 'All' },
];

// Description shown under the chart so user knows what they're looking at
const TIMEFRAME_DESCRIPTIONS: Record<ChartTimeframe, string> = {
  '15M': 'Last 15 minutes',
  '1H': 'Last hour',
  '1D': 'Last 24 hours',
  '1W': 'Last 7 days',
  '1M': 'Last 30 days',
  'ALL': 'All time',
};

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
  const { address: _tokenAddress } = useParams<{ address: string }>();
  useAutoLockOnResume();

  const { address: walletAddress, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);

  const state = location.state as LocationState | null;
  const token = state?.token;
  const balance = state?.balance ? BigInt(state.balance) : 0n;
  const price = state?.price ?? 0;

  const [imgErrored, setImgErrored] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState<ChartTimeframe>('1W');
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [lineData, setLineData] = useState<TimedPrice[] | null>(null);
  const [candleData, setCandleData] = useState<TimedOHLC[] | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  const geckoId = token ? resolveGeckoId(token) : null;

  useEffect(() => {
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  // Fetch chart data with debounce + live refresh interval
  useEffect(() => {
    if (!geckoId) {
      setLineData(null);
      setCandleData(null);
      return;
    }

    let cancelled = false;
    const load = (force: boolean) => {
      if (!force) setChartLoading(true);
      if (chartMode === 'line') {
        fetchLineChart(geckoId, activeTimeframe, force).then((data) => {
          if (cancelled) return;
          if (data.length >= 2) setLineData(data);
          setChartLoading(false);
        });
      } else {
        fetchCandles(geckoId, activeTimeframe, force).then((data) => {
          if (cancelled) return;
          if (data.length >= 1) setCandleData(data);
          setChartLoading(false);
        });
      }
    };

    const debounce = setTimeout(() => load(false), 300);
    const interval = setInterval(() => load(true), LIVE_REFRESH_MS[activeTimeframe]);
    return () => { cancelled = true; clearTimeout(debounce); clearInterval(interval); };
  }, [geckoId, activeTimeframe, chartMode]);

  if (!isUnlocked || !walletAddress || !token) {
    if (!token) navigate('/wallet', { replace: true });
    return null;
  }

  const numericBalance = parseFloat(formatBalance(balance, token.decimals)) || 0;
  const usdValue = numericBalance * price;

  const chartChange = (() => {
    if (chartMode === 'line' && lineData && lineData.length >= 2) {
      const first = lineData[0][1];
      const last = lineData[lineData.length - 1][1];
      return ((last - first) / first) * 100;
    }
    if (chartMode === 'candle' && candleData && candleData.length >= 1) {
      const first = candleData[0][1]; // first open
      const last = candleData[candleData.length - 1][4]; // last close
      return ((last - first) / first) * 100;
    }
    return null;
  })();

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

  const hasChartData = chartMode === 'line'
    ? (lineData && lineData.length >= 2)
    : (candleData && candleData.length >= 1);

  return (
    <div className="safe-top flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md mx-auto w-full px-5 py-4 relative z-10">
        {/* Back */}
        <button
          onClick={() => navigate('/wallet')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-3 active:scale-95"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {/* Token identity + price (consolidated) */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-12 h-12 shrink-0">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: stringToColor(token.symbol) }}
            >
              {token.symbol.slice(0, 2)}
            </div>
            {token.logoUrl && !imgErrored && (
              <img
                src={token.logoUrl}
                alt={token.symbol}
                className="w-12 h-12 rounded-full absolute inset-0 object-cover"
                onError={() => setImgErrored(true)}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white truncate leading-tight">{token.name}</h1>
            <p className="text-gray-400 text-xs">{token.symbol}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-white tabular-nums leading-tight">{formatPrice(price)}</p>
            {chartChange !== null && (
              <span className={`text-xs font-semibold ${chartChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {chartChange >= 0 ? '+' : ''}{chartChange.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        {/* Chart card */}
        {geckoId && (
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-3 mb-3 shadow-2xl">
            {/* Top row: live indicator + chart mode toggle */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Live</span>
              </div>
              <div className="flex gap-1 bg-white/[0.03] border border-white/[0.05] rounded-lg p-0.5">
                <button
                  onClick={() => setChartMode('line')}
                  className={`p-1.5 rounded-md transition-all ${
                    chartMode === 'line'
                      ? 'bg-[#FF6900] text-white'
                      : 'text-gray-500 hover:text-white'
                  }`}
                  title="Line chart"
                >
                  <TrendingUp size={14} />
                </button>
                <button
                  onClick={() => setChartMode('candle')}
                  className={`p-1.5 rounded-md transition-all ${
                    chartMode === 'candle'
                      ? 'bg-[#FF6900] text-white'
                      : 'text-gray-500 hover:text-white'
                  }`}
                  title="Candlestick chart"
                >
                  <BarChart3 size={14} />
                </button>
              </div>
            </div>

            {/* Timeframe selector */}
            <div className="flex gap-1 mb-2 bg-white/[0.03] border border-white/[0.05] rounded-xl p-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.key}
                  onClick={() => setActiveTimeframe(tf.key)}
                  className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all ${
                    activeTimeframe === tf.key
                      ? 'bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-white'
                      : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Chart area */}
            <div className="relative min-h-[140px] flex items-center justify-center">
              {chartLoading && !hasChartData ? (
                <div className="w-5 h-5 border-2 border-[#FF6900] border-t-transparent rounded-full animate-spin" />
              ) : hasChartData ? (
                <div className="w-full">
                  {chartMode === 'line' ? (
                    <DetailLineChart data={lineData!} timeframe={activeTimeframe} />
                  ) : (
                    <CandlestickChart data={candleData!} timeframe={activeTimeframe} />
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-600">No chart data available</p>
              )}
            </div>

            {/* Description of what's being shown */}
            <p className="text-[10px] text-gray-600 text-center mt-1.5 tracking-wide">
              {TIMEFRAME_DESCRIPTIONS[activeTimeframe]}
            </p>
          </div>
        )}

        {/* Balance row (compact, single line) */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl px-4 py-3 mb-3 shadow-2xl flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Balance</p>
            <p className="text-base font-bold text-white truncate">
              {formatBalance(balance, token.decimals)} <span className="text-gray-500 text-xs">{token.symbol}</span>
            </p>
          </div>
          <p className="text-gray-400 text-sm tabular-nums shrink-0">{formatUsd(usdValue)}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => navigate('/wallet/send', { state: { preselectedToken: token } })}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                       bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                       text-white text-sm font-semibold transition-all active:scale-[0.97]
                       hover:shadow-[0_0_20px_rgba(255,105,0,0.3)]"
          >
            <Send size={15} />
            Send
          </button>
          <button
            onClick={() => navigate('/wallet/swap')}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                       bg-white/[0.06] border border-white/[0.08]
                       text-white text-sm font-semibold transition-all active:scale-[0.97]
                       hover:bg-white/[0.1]"
          >
            <RefreshCw size={15} />
            Swap
          </button>
        </div>

        {/* Contract — compact single line */}
        {!token.isNative && (
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl px-3 py-2 shadow-2xl flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider shrink-0">Contract</span>
            <p className="text-[11px] text-gray-300 font-mono flex-1 truncate">
              {token.address.slice(0, 8)}…{token.address.slice(-6)}
            </p>
            <button
              onClick={handleCopyAddress}
              className="p-1.5 rounded-md hover:bg-white/[0.06] text-gray-400 hover:text-white transition-all shrink-0 active:scale-95"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <a
              href={`${explorerBase}/token/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-white/[0.06] text-gray-400 hover:text-white transition-all shrink-0"
            >
              <ExternalLink size={13} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenDetail;
