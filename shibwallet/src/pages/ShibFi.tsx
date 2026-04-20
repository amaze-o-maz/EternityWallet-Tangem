import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Users,
  RefreshCw,
  Zap,
  BarChart3,
  ArrowRightLeft,
} from 'lucide-react';
import { useWalletStore } from '../store/walletStore';
import { useShibFiStore } from '../store/shibfiStore';
import { useBurnStore } from '../store/burnStore';
import {
  computeSignals,
  burnTrendLabel,
  marketPressureLabel,
  momentumLabel,
} from '../lib/shibfiSignals';

function fmtNum(n: number, decimals = 2): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(decimals);
}

function fmtPrice(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.001) return '$' + n.toFixed(8);
  if (n < 1) return '$' + n.toFixed(6);
  return '$' + n.toFixed(2);
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

const ShibFi: React.FC = () => {
  const navigate = useNavigate();
  const { isUnlocked } = useWalletStore();
  const store = useShibFiStore();
  const burnStore = useBurnStore();

  useEffect(() => {
    if (!localStorage.getItem('shibwallet_vault')) {
      navigate('/', { replace: true });
      return;
    }
    if (!isUnlocked) navigate('/lock', { replace: true });
  }, [isUnlocked, navigate]);

  useEffect(() => {
    store.loadCache();
    if (store.needsRefresh()) store.fetchAll();

    const iv = setInterval(() => {
      if (useShibFiStore.getState().needsRefresh()) {
        useShibFiStore.getState().fetchAll();
      }
    }, 60_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && useShibFiStore.getState().needsRefresh()) {
        useShibFiStore.getState().fetchAll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signals = useMemo(() => {
    return computeSignals({
      burns24h: burnStore.burns24h,
      burns7d: burnStore.burns7d,
      burns30d: burnStore.burns30d,
      funding: store.funding,
      oi: store.openInterest,
      ticker: store.ticker,
      exchangeFlows: store.exchangeFlows,
      shibPrice: burnStore.shibPrice,
    });
  }, [store.funding, store.openInterest, store.ticker, store.exchangeFlows, burnStore.burns24h, burnStore.burns7d, burnStore.burns30d, burnStore.shibPrice]);

  const burnTrend = useMemo(
    () => burnTrendLabel(burnStore.burns24h, burnStore.burns7d),
    [burnStore.burns24h, burnStore.burns7d],
  );
  const pressure = useMemo(() => marketPressureLabel(store.funding), [store.funding]);
  const momentum = useMemo(() => momentumLabel(store.ticker), [store.ticker]);

  if (!isUnlocked) return null;

  const isLoading = store.loading && !store.ticker;

  return (
    <main className="relative z-10 max-w-md mx-auto w-full px-5 pt-5 pb-40">
      {/* Header */}
      <div className="flex items-center justify-between mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <Activity size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">ShibFi</h1>
            <p className="text-[10px] text-gray-500">Market Intelligence</p>
          </div>
        </div>
        <button
          onClick={() => store.fetchAll()}
          disabled={store.loading}
          className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-400
                     hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={store.loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 50ms both' }}>
          <div className="space-y-2">
            {signals.map((sig, idx) => (
              <div
                key={sig.id}
                className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/[0.06]"
                style={{
                  background: sig.priority <= 1
                    ? 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0.2) 100%)'
                    : 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(0,0,0,0.2) 100%)',
                  animation: `slide-up-fade 0.35s ease-out ${idx * 40}ms both`,
                }}
              >
                <span className="text-lg leading-none mt-0.5">{sig.emoji}</span>
                <p className="text-xs text-gray-200 leading-relaxed">{sig.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Indicator Pills */}
      <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 100ms both' }}>
        <div className="grid grid-cols-3 gap-2">
          <div className="px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">Burn</p>
            <p className={`text-[11px] font-bold ${
              burnTrend === 'Rising' ? 'text-orange-400' : burnTrend === 'Cooling' ? 'text-blue-400' : 'text-gray-400'
            }`}>
              {burnTrend}
            </p>
          </div>
          <div className="px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">Pressure</p>
            <p className={`text-[11px] font-bold ${
              pressure === 'Long crowded' ? 'text-green-400' : pressure === 'Short heavy' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {pressure}
            </p>
          </div>
          <div className="px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">Momentum</p>
            <p className={`text-[11px] font-bold ${
              momentum === 'Expanding' ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {momentum}
            </p>
          </div>
        </div>
      </section>

      {/* Price Ticker */}
      {isLoading ? (
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 140ms both' }}>
          <div className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <div className="space-y-3">
              <div className="h-8 w-32 rounded bg-white/[0.06] animate-shimmer" />
              <div className="h-4 w-48 rounded bg-white/[0.04] animate-shimmer" />
              <div className="h-4 w-24 rounded bg-white/[0.04] animate-shimmer" />
            </div>
          </div>
        </section>
      ) : store.ticker && (
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 140ms both' }}>
          <div className="p-5 rounded-2xl border border-white/[0.06] overflow-hidden relative"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(0,0,0,0.2) 100%)' }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">SHIB/USDT</p>
                <p className="text-2xl font-black text-white tabular-nums">
                  {fmtPrice(store.ticker.price / 1000)}
                </p>
              </div>
              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                store.ticker.priceChangePct >= 0
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}>
                {store.ticker.priceChangePct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {fmtPct(store.ticker.priceChangePct)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Volume 24h</p>
                <p className="text-xs text-white font-semibold tabular-nums mt-0.5">
                  {fmtNum(store.ticker.volume24h)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">High</p>
                <p className="text-xs text-green-400 font-semibold tabular-nums mt-0.5">
                  {fmtPrice(store.ticker.high24h / 1000)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Low</p>
                <p className="text-xs text-red-400 font-semibold tabular-nums mt-0.5">
                  {fmtPrice(store.ticker.low24h / 1000)}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Funding + OI */}
      {(store.funding || store.openInterest) && (
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 180ms both' }}>
          <div className="grid grid-cols-2 gap-3">
            {store.funding && (
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 size={12} className="text-purple-400" />
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Funding</p>
                </div>
                <p className={`text-lg font-bold tabular-nums ${
                  store.funding.rate > 0 ? 'text-green-400' : store.funding.rate < 0 ? 'text-red-400' : 'text-gray-300'
                }`}>
                  {(store.funding.rate * 100).toFixed(4)}%
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">{store.funding.label}</p>
              </div>
            )}
            {store.openInterest && (
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers size={12} className="text-cyan-400" />
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Open Interest</p>
                </div>
                <p className="text-lg font-bold text-white tabular-nums">
                  {fmtNum(store.openInterest.oi)}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">contracts</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Exchange Flows */}
      {store.exchangeFlows && (
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 220ms both' }}>
          <div className="p-4 rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(0,0,0,0.2) 100%)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft size={14} className="text-purple-400" />
              <h3 className="text-xs font-bold text-white">Exchange Flows (24h)</h3>
              <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                store.exchangeFlows.netLabel === 'Net outflow'
                  ? 'bg-green-500/10 text-green-400'
                  : store.exchangeFlows.netLabel === 'Net inflow'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-gray-500/10 text-gray-400'
              }`}>
                {store.exchangeFlows.netLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Inflow</p>
                <p className="text-sm font-bold text-red-400 tabular-nums mt-0.5">
                  <ArrowDownRight size={11} className="inline mr-0.5" />
                  {fmtNum(store.exchangeFlows.inflow24h)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Outflow</p>
                <p className="text-sm font-bold text-green-400 tabular-nums mt-0.5">
                  <ArrowUpRight size={11} className="inline mr-0.5" />
                  {fmtNum(store.exchangeFlows.outflow24h)}
                </p>
              </div>
            </div>

            {store.exchangeFlows.recentMoves.length > 0 && (
              <div className="border-t border-white/[0.06] pt-2.5 space-y-2">
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Recent Moves</p>
                {store.exchangeFlows.recentMoves.slice(0, 5).map((move) => (
                  <div key={move.hash} className="flex items-center gap-2 text-[11px]">
                    <span className={move.direction === 'inflow' ? 'text-red-400' : 'text-green-400'}>
                      {move.direction === 'inflow' ? '>' : '<'}
                    </span>
                    <span className="text-gray-300 font-medium">{fmtNum(move.amount)} SHIB</span>
                    <span className="text-gray-600 ml-auto">{move.exchangeName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Shibarium Stats */}
      {store.shibarium && (
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 260ms both' }}>
          <div className="p-4 rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(0,0,0,0.2) 100%)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-emerald-400" />
              <h3 className="text-xs font-bold text-white">Shibarium Network</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Transactions</p>
                <p className="text-sm font-bold text-white tabular-nums mt-0.5">
                  {fmtNum(store.shibarium.totalTransactions)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Blocks</p>
                <p className="text-sm font-bold text-white tabular-nums mt-0.5">
                  {fmtNum(store.shibarium.totalBlocks)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Addresses</p>
                <p className="text-sm font-bold text-white tabular-nums mt-0.5">
                  {fmtNum(store.shibarium.totalAddresses)}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Block Time</p>
                <p className="text-sm font-bold text-white tabular-nums mt-0.5">
                  {store.shibarium.avgBlockTime.toFixed(1)}s
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Token Holders */}
      {store.tokenHolders.length > 0 && (
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 300ms both' }}>
          <div className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-amber-400" />
              <h3 className="text-xs font-bold text-white">Token Holders</h3>
            </div>

            <div className="space-y-2.5">
              {store.tokenHolders.map((token) => (
                <div key={`${token.symbol}-${token.chain}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{token.symbol}</span>
                    <span className="text-[9px] text-gray-600 uppercase">{token.chain}</span>
                  </div>
                  <span className="text-xs text-gray-300 font-semibold tabular-nums">
                    {fmtNum(token.holders, 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Last updated */}
      {store.lastUpdated && (
        <p className="text-center text-[10px] text-gray-600 mt-2">
          Updated {new Date(store.lastUpdated).toLocaleTimeString()}
        </p>
      )}
    </main>
  );
};

export default ShibFi;
