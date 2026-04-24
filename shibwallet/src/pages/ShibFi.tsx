import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Users,
  RefreshCw,
  Zap,
  BarChart3,
  ArrowRightLeft,
  Shield,
  Gauge,
  Radio,
  ExternalLink,
  X,
  Copy,
  Check,
} from 'lucide-react';
import type { FlowTransaction } from '../lib/exchangeFlows';
import { useWalletStore } from '../store/walletStore';
import { useShibFiStore } from '../store/shibfiStore';
import { useBurnStore } from '../store/burnStore';
import {
  computeSignals,
  burnTrendLabel,
  marketPressureLabel,
  momentumLabel,
} from '../lib/shibfiSignals';
import { ETHEREUM_TOKENS, SHIBARIUM_TOKENS } from '../lib/tokens';

/* ── Formatters ─────────────────────────────────────────────────────── */

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

function fmtHolders(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

const TOKEN_LOGOS: Record<string, string> = {};
for (const t of [...ETHEREUM_TOKENS, ...SHIBARIUM_TOKENS]) {
  if (t.logoUrl && !TOKEN_LOGOS[t.symbol]) TOKEN_LOGOS[t.symbol] = t.logoUrl;
}

/* ── Main Component ─────────────────────────────────────────────────── */

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
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shibHolderTotal = useMemo(() => {
    let total = 0;
    for (const h of store.tokenHolders) {
      if (h.symbol === 'SHIB' && h.holders) total += h.holders;
    }
    return total;
  }, [store.tokenHolders]);

  const signals = useMemo(() => {
    return computeSignals({
      burns24h: burnStore.burns24h,
      burns7d: burnStore.burns7d,
      burns30d: burnStore.burns30d,
      funding: store.funding,
      oi: store.openInterest,
      ticker: store.ticker,
      exchangeFlows: store.exchangeFlows,
      defiDominance: store.defiDominance,
      shibarium: store.shibarium,
      holderGrowth: store.holderGrowth,
      shibHolderTotal,
      shibPrice: burnStore.shibPrice,
    });
  }, [store.funding, store.openInterest, store.ticker, store.exchangeFlows, store.defiDominance, store.shibarium, store.holderGrowth, shibHolderTotal, burnStore.burns24h, burnStore.burns7d, burnStore.burns30d, burnStore.shibPrice]);

  const burnTrend = useMemo(
    () => burnTrendLabel(burnStore.burns24h, burnStore.burns7d),
    [burnStore.burns24h, burnStore.burns7d],
  );
  const pressure = useMemo(() => marketPressureLabel(store.funding), [store.funding]);
  const momentum = useMemo(() => momentumLabel(store.ticker), [store.ticker]);

  const [selectedMove, setSelectedMove] = useState<FlowTransaction | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!isUnlocked) return null;

  const isLoading = store.loading && !store.ticker;
  const priceUp = (store.ticker?.priceChangePct ?? 0) >= 0;

  return (
    <>
      {/* ── Ambient background glow ─────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 top-0 h-[60vh] pointer-events-none z-0 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-20 w-[500px] h-[500px]"
          style={{
            background:
              'radial-gradient(circle, rgba(255,105,0,0.1) 0%, rgba(196,27,14,0.05) 30%, transparent 60%)',
            animation: 'halo-breathe 6s ease-in-out infinite',
          }}
        />
      </div>

      <main className="relative z-10 max-w-md mx-auto w-full px-5 pt-5 pb-40">
        {/* ── HERO HEADER ──────────────────────────────────────────── */}
        <section className="relative text-center mb-6" style={{ animation: 'slide-up-fade 0.5s ease-out' }}>
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-4 w-60 h-60 pointer-events-none -z-0"
            style={{
              background:
                'radial-gradient(circle, rgba(59,130,246,0.2) 0%, rgba(139,92,246,0.08) 40%, transparent 65%)',
              animation: 'halo-breathe 5s ease-in-out infinite',
            }}
          />

          {/* Icon medallion */}
          <div className="relative inline-flex items-center justify-center mb-4 z-10">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(255,105,0,0.5) 0%, transparent 65%)',
                filter: 'blur(14px)',
                transform: 'scale(2)',
              }}
            />
            <div
              className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center border border-white/10"
              style={{
                background:
                  'radial-gradient(circle at 30% 20%, #FFD166 0%, #FF6900 40%, #C41B0E 100%)',
                boxShadow:
                  '0 0 40px rgba(255,105,0,0.5), 0 0 80px rgba(196,27,14,0.25), inset 0 2px 0 rgba(255,255,255,0.25)',
              }}
            >
              <Activity
                size={30}
                className="text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                strokeWidth={2.5}
              />
            </div>
          </div>

          {/* Live badge */}
          <div className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                          bg-orange-500/10 border border-orange-500/25 mb-3 z-10">
            <div className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
            </div>
            <span className="text-[10px] font-bold text-orange-300 uppercase tracking-[0.2em]">
              Market Intelligence
            </span>
          </div>

          {/* Road to $0.01 hero */}
          {store.ticker && (() => {
            const realPrice = store.ticker.price / 1000;
            const leadingZeros = realPrice >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(realPrice)) - 1);
            const targetZeros = 1;
            const zerosToKill = Math.max(0, leadingZeros - targetZeros);

            return (
              <div className="relative z-10">
                <h1 className="text-[32px] sm:text-[38px] font-black tracking-tight leading-none mb-4">
                  <span
                    className="bg-gradient-to-br from-[#FFE48C] via-[#FF6900] to-[#C41B0E] bg-clip-text text-transparent"
                    style={{ filter: 'drop-shadow(0 0 20px rgba(255,105,0,0.45))' }}
                  >
                    Road to $0.01
                  </span>
                </h1>

                {/* Zeros to kill + daily change */}
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <Zap size={11} className="text-orange-400" />
                    <span className="text-[11px] font-black text-orange-400 tabular-nums">{zerosToKill} zeros to go</span>
                  </span>
                  <span className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold ${
                    priceUp ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {priceUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {fmtPct(store.ticker.priceChangePct)}
                  </span>
                </div>
              </div>
            );
          })()}

          {isLoading && (
            <div className="space-y-3 py-4 relative z-10">
              <div className="h-12 w-56 mx-auto rounded bg-white/[0.06] animate-shimmer" />
              <div className="h-4 w-32 mx-auto rounded bg-white/[0.04] animate-shimmer" />
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={() => store.fetchAll()}
            disabled={store.loading}
            className="absolute top-2 right-0 p-2 rounded-lg text-gray-500 hover:text-white
                       transition-colors disabled:opacity-40 z-20"
          >
            <RefreshCw size={14} className={store.loading ? 'animate-spin' : ''} />
          </button>
        </section>

        {/* ── SIGNALS ─────────────────────────────────────────────── */}
        {signals.length > 0 && (
          <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 60ms both' }}>
            <div className="space-y-2">
              {signals.map((sig, idx) => {
                const isUrgent = sig.priority <= 1;
                return (
                  <div
                    key={sig.id}
                    className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl border overflow-hidden relative
                      ${isUrgent ? 'border-red-500/20' : 'border-white/[0.06]'}`}
                    style={{
                      background: isUrgent
                        ? 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(0,0,0,0.25) 100%)'
                        : 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(0,0,0,0.2) 100%)',
                      animation: `slide-up-fade 0.35s ease-out ${idx * 50}ms both`,
                    }}
                  >
                    {isUrgent && (
                      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
                    )}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isUrgent ? 'bg-red-500/15' : 'bg-blue-500/10'
                    }`}>
                      <span className="text-base">{sig.emoji}</span>
                    </div>
                    <p className="text-[13px] text-gray-200 leading-relaxed pt-1.5">{sig.message}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── INDICATOR PILLS ─────────────────────────────────────── */}
        <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 120ms both' }}>
          <div className="grid grid-cols-3 gap-2">
            {([
              {
                label: 'Burn',
                value: burnTrend,
                icon: <Radio size={11} />,
                color: burnTrend === 'Rising' ? 'text-orange-400' : burnTrend === 'Cooling' ? 'text-blue-400' : 'text-gray-400',
                bg: burnTrend === 'Rising' ? 'border-orange-500/20' : burnTrend === 'Cooling' ? 'border-blue-500/20' : 'border-white/[0.06]',
                glow: burnTrend === 'Rising' ? 'rgba(255,105,0,0.08)' : burnTrend === 'Cooling' ? 'rgba(59,130,246,0.08)' : undefined,
              },
              {
                label: 'Pressure',
                value: pressure,
                icon: <Gauge size={11} />,
                color: pressure === 'Long crowded' ? 'text-green-400' : pressure === 'Short heavy' ? 'text-red-400' : 'text-gray-400',
                bg: pressure === 'Long crowded' ? 'border-green-500/20' : pressure === 'Short heavy' ? 'border-red-500/20' : 'border-white/[0.06]',
                glow: pressure !== 'Neutral' ? (pressure === 'Long crowded' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : undefined,
              },
              {
                label: 'Momentum',
                value: momentum,
                icon: <Activity size={11} />,
                color: momentum === 'Expanding' ? 'text-green-400' : 'text-yellow-400',
                bg: momentum === 'Expanding' ? 'border-green-500/20' : 'border-yellow-500/20',
                glow: momentum === 'Expanding' ? 'rgba(34,197,94,0.08)' : 'rgba(234,179,8,0.08)',
              },
            ] as const).map((pill, idx) => (
              <div
                key={pill.label}
                className={`relative px-3 py-3 rounded-xl border overflow-hidden text-center group
                           hover:scale-[1.02] transition-transform ${pill.bg}`}
                style={{
                  background: pill.glow
                    ? `linear-gradient(160deg, ${pill.glow} 0%, rgba(0,0,0,0.2) 100%)`
                    : 'rgba(255,255,255,0.02)',
                  animation: `slide-up-fade 0.4s ease-out ${140 + idx * 50}ms both`,
                }}
              >
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <span className="text-gray-500">{pill.icon}</span>
                  <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.14em]">{pill.label}</p>
                </div>
                <p className={`text-[12px] font-bold ${pill.color}`}>{pill.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── MARKET OVERVIEW ──────────────────────────────────────── */}
        {store.marketOverview && (() => {
          const mo = store.marketOverview;
          const fgColor = mo.fearGreedValue >= 60 ? 'text-green-400' : mo.fearGreedValue >= 40 ? 'text-yellow-400' : 'text-red-400';
          const fgBg = mo.fearGreedValue >= 60 ? 'border-green-500/20' : mo.fearGreedValue >= 40 ? 'border-yellow-500/20' : 'border-red-500/20';
          const fgGlow = mo.fearGreedValue >= 60 ? 'rgba(34,197,94,0.08)' : mo.fearGreedValue >= 40 ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)';
          const altColor = mo.altcoinIndex >= 50 ? 'text-green-400' : mo.altcoinIndex >= 30 ? 'text-yellow-400' : 'text-red-400';
          const altBg = mo.altcoinIndex >= 50 ? 'border-green-500/20' : mo.altcoinIndex >= 30 ? 'border-yellow-500/20' : 'border-red-500/20';
          const altGlow = mo.altcoinIndex >= 50 ? 'rgba(34,197,94,0.08)' : mo.altcoinIndex >= 30 ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)';
          const mcUp = mo.marketCapChange24h >= 0;

          return (
            <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 140ms both' }}>
              <div
                className="rounded-2xl border border-white/[0.06] overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,105,0,0.04) 0%, rgba(0,0,0,0.2) 100%)',
                }}
              >
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                  <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center">
                    <Activity size={12} className="text-orange-400" />
                  </div>
                  <h3 className="text-xs font-bold text-white">Market Overview</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 px-3 py-3">
                  {/* Total Market Cap */}
                  <div
                    className="relative px-3 py-3 rounded-xl border border-white/[0.06] overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[9px] text-orange-500/60">🔸</span>
                      <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.12em]">Total Market Cap</p>
                    </div>
                    <p className="text-[15px] font-bold text-white tabular-nums">${fmtNum(mo.totalMarketCap)}</p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${mcUp ? 'text-green-500/70' : 'text-red-500/70'}`}>
                      {mcUp ? '▲' : '▼'} {Math.abs(mo.marketCapChange24h).toFixed(1)}% 24h
                    </p>
                  </div>

                  {/* 24h Volume */}
                  <div
                    className="relative px-3 py-3 rounded-xl border border-white/[0.06] overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[9px] text-orange-500/60">🔸</span>
                      <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.12em]">24h Volume</p>
                    </div>
                    <p className="text-[15px] font-bold text-white tabular-nums">${fmtNum(mo.totalVolume24h)}</p>
                    <p className="text-[10px] font-semibold mt-0.5 text-gray-600">
                      Global crypto
                    </p>
                  </div>

                  {/* Fear & Greed */}
                  <div
                    className={`relative px-3 py-3 rounded-xl border overflow-hidden ${fgBg}`}
                    style={{ background: `linear-gradient(160deg, ${fgGlow} 0%, rgba(0,0,0,0.2) 100%)` }}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[9px] text-orange-500/60">🔸</span>
                      <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.12em]">Fear & Greed</p>
                    </div>
                    <p className={`text-[15px] font-bold tabular-nums ${fgColor}`}>{mo.fearGreedValue}</p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${fgColor} opacity-70`}>{mo.fearGreedLabel}</p>
                  </div>

                  {/* Altcoin Index */}
                  <div
                    className={`relative px-3 py-3 rounded-xl border overflow-hidden ${altBg}`}
                    style={{ background: `linear-gradient(160deg, ${altGlow} 0%, rgba(0,0,0,0.2) 100%)` }}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[9px] text-orange-500/60">🔸</span>
                      <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.12em]">Altcoin Index</p>
                    </div>
                    <p className={`text-[15px] font-bold tabular-nums ${altColor}`}>{mo.altcoinIndex}/100</p>
                    <p className="text-[10px] font-semibold mt-0.5 text-gray-600">
                      BTC dom {mo.btcDominance.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── VOLUME + RANGE BAR ──────────────────────────────────── */}
        {store.ticker && (
          <section
            className="mb-5 rounded-2xl border border-white/[0.06] overflow-hidden relative"
            style={{
              animation: 'slide-up-fade 0.4s ease-out 180ms both',
              background:
                'linear-gradient(135deg, rgba(59,130,246,0.07) 0%, rgba(139,92,246,0.04) 50%, rgba(0,0,0,0.2) 100%)',
            }}
          >
            <div className="px-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.12em] mb-1">Volume 24h</p>
                  <p className="text-sm font-bold text-white tabular-nums">{fmtNum(store.ticker.volume24h)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.12em] mb-1">24h High</p>
                  <p className="text-sm font-bold text-green-400 tabular-nums">
                    {fmtPrice(store.ticker.high24h / 1000)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.12em] mb-1">24h Low</p>
                  <p className="text-sm font-bold text-red-400 tabular-nums">
                    {fmtPrice(store.ticker.low24h / 1000)}
                  </p>
                </div>
              </div>

              {/* Range bar */}
              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      background: 'linear-gradient(to right, #EF4444, #F59E0B, #22C55E)',
                      left: '0%',
                      width: (() => {
                        const range = store.ticker!.high24h - store.ticker!.low24h;
                        if (range <= 0) return '50%';
                        const pos = ((store.ticker!.price - store.ticker!.low24h) / range) * 100;
                        return `${Math.max(5, Math.min(95, pos))}%`;
                      })(),
                    }}
                  />
                  {/* Current price marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-400"
                    style={{
                      left: (() => {
                        const range = store.ticker!.high24h - store.ticker!.low24h;
                        if (range <= 0) return '50%';
                        const pos = ((store.ticker!.price - store.ticker!.low24h) / range) * 100;
                        return `${Math.max(5, Math.min(95, pos))}%`;
                      })(),
                      transform: 'translate(-50%, -50%)',
                      boxShadow: '0 0 8px rgba(59,130,246,0.6)',
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── FUNDING + OPEN INTEREST ─────────────────────────────── */}
        {(store.funding || store.openInterest) && (
          <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 220ms both' }}>
            <div className="grid grid-cols-2 gap-3">
              {store.funding && (
                <div
                  className="relative p-4 rounded-2xl border border-white/[0.06] overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(160deg, rgba(168,85,247,0.08) 0%, rgba(0,0,0,0.2) 100%)',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-purple-500/15 flex items-center justify-center">
                      <BarChart3 size={12} className="text-purple-400" />
                    </div>
                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.14em]">Funding</p>
                  </div>
                  <p className={`text-xl font-black tabular-nums leading-none ${
                    store.funding.rate > 0 ? 'text-green-400' : store.funding.rate < 0 ? 'text-red-400' : 'text-gray-300'
                  }`}>
                    {(store.funding.rate * 100).toFixed(4)}%
                  </p>
                  <p className={`text-[10px] mt-1.5 font-semibold ${
                    store.funding.label === 'Long heavy' ? 'text-green-500/70' : store.funding.label === 'Short heavy' ? 'text-red-500/70' : 'text-gray-600'
                  }`}>
                    {store.funding.label}
                  </p>
                </div>
              )}
              {store.openInterest && (
                <div
                  className="relative p-4 rounded-2xl border border-white/[0.06] overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(160deg, rgba(6,182,212,0.07) 0%, rgba(0,0,0,0.2) 100%)',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                      <Layers size={12} className="text-cyan-400" />
                    </div>
                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.14em]">Open Interest</p>
                  </div>
                  <p className="text-xl font-black text-white tabular-nums leading-none">
                    {fmtNum(store.openInterest.oi)}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1.5 font-semibold">
                    SHIB
                    {store.openInterest.perExchange?.length
                      ? ` · ${store.openInterest.perExchange.length} exchange${store.openInterest.perExchange.length > 1 ? 's' : ''}`
                      : ''}
                  </p>
                  {store.openInterest.perExchange && store.openInterest.perExchange.length > 0 && (
                    <>
                      <div className="mt-2.5 flex h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
                        {store.openInterest.perExchange.map((e, i) => {
                          const pct = (e.oi / store.openInterest!.oi) * 100;
                          const colors = ['#06b6d4', '#8b5cf6', '#f59e0b'];
                          return (
                            <div
                              key={e.exchange}
                              style={{
                                width: `${pct}%`,
                                background: colors[i % colors.length],
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        {store.openInterest.perExchange.map((e, i) => {
                          const colors = ['#06b6d4', '#8b5cf6', '#f59e0b'];
                          const pct = (e.oi / store.openInterest!.oi) * 100;
                          return (
                            <span key={e.exchange} className="text-[9px] text-gray-500 font-semibold flex items-center gap-1">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: colors[i % colors.length] }}
                              />
                              {e.exchange} {pct.toFixed(0)}%
                            </span>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── EXCHANGE FLOWS ──────────────────────────────────────── */}
        {store.exchangeFlows && (
          <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 260ms both' }}>
            <div
              className="rounded-2xl border border-white/[0.06] overflow-hidden"
              style={{
                background:
                  'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(0,0,0,0.2) 100%)',
              }}
            >
              <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/[0.06]">
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <ArrowRightLeft size={13} className="text-purple-400" />
                </div>
                <h3 className="text-xs font-bold text-white">Exchange Flows</h3>
                <span className="text-[9px] text-gray-600 font-bold">24H</span>
                <span className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                  store.exchangeFlows.netLabel === 'Net outflow'
                    ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                    : store.exchangeFlows.netLabel === 'Net inflow'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                      : 'bg-gray-500/10 text-gray-400 border border-white/[0.06]'
                }`}>
                  {store.exchangeFlows.netLabel}
                </span>
              </div>

              <div className="px-4 py-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/10">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.12em] mb-1">Inflow</p>
                    <div className="flex items-center gap-1">
                      <ArrowDownRight size={14} className="text-red-400" />
                      <p className="text-[15px] font-bold text-red-400 tabular-nums">
                        {fmtNum(store.exchangeFlows.inflow24h)}
                      </p>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-green-500/[0.06] border border-green-500/10">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.12em] mb-1">Outflow</p>
                    <div className="flex items-center gap-1">
                      <ArrowUpRight size={14} className="text-green-400" />
                      <p className="text-[15px] font-bold text-green-400 tabular-nums">
                        {fmtNum(store.exchangeFlows.outflow24h)}
                      </p>
                    </div>
                  </div>
                </div>

                {store.exchangeFlows.recentMoves.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.14em] mb-2">
                      Recent Whale Moves
                    </p>
                    {store.exchangeFlows.recentMoves.slice(0, 5).map((move, idx) => (
                      <div
                        key={move.hash}
                        className="flex items-center gap-2.5 py-2.5 border-b border-white/[0.03] last:border-b-0
                                   cursor-pointer active:bg-white/[0.04] transition-colors rounded-lg -mx-1 px-1"
                        style={{ animation: `slide-up-fade 0.3s ease-out ${idx * 30}ms both` }}
                        onClick={() => setSelectedMove(move)}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          move.direction === 'inflow'
                            ? 'bg-red-500/15'
                            : 'bg-green-500/15'
                        }`}>
                          {move.direction === 'inflow'
                            ? <ArrowDownRight size={11} className="text-red-400" />
                            : <ArrowUpRight size={11} className="text-green-400" />
                          }
                        </div>
                        <span className="text-[12px] text-gray-200 font-semibold tabular-nums">
                          {fmtNum(move.amount)} SHIB
                        </span>
                        <span className="text-[10px] text-gray-500 ml-auto font-medium">{move.exchangeName}</span>
                        <ExternalLink size={10} className="text-gray-600 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── SHIBARIUM NETWORK ───────────────────────────────────── */}
        {store.shibarium && (
          <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 300ms both' }}>
            <div
              className="rounded-2xl border border-white/[0.06] overflow-hidden"
              style={{
                background:
                  'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(0,0,0,0.2) 100%)',
              }}
            >
              <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/[0.06]">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Zap size={13} className="text-emerald-400" fill="currentColor" />
                </div>
                <h3 className="text-xs font-bold text-white">Shibarium Network</h3>
                <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10">
                  <div className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-[9px] text-emerald-400 font-bold">LIVE</span>
                </div>
              </div>

              <div className="px-4 py-4 grid grid-cols-2 gap-x-4 gap-y-4">
                {([
                  { label: 'Transactions', value: fmtNum(store.shibarium.totalTransactions), icon: <ArrowRightLeft size={11} /> },
                  { label: 'Blocks', value: fmtNum(store.shibarium.totalBlocks), icon: <Layers size={11} /> },
                  { label: 'Addresses', value: fmtNum(store.shibarium.totalAddresses), icon: <Users size={11} /> },
                  { label: 'Block Time', value: `${store.shibarium.avgBlockTime.toFixed(1)}s`, icon: <Gauge size={11} /> },
                ] as const).map((stat, idx) => (
                  <div
                    key={stat.label}
                    className="relative p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]"
                    style={{ animation: `slide-up-fade 0.35s ease-out ${300 + idx * 40}ms both` }}
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="text-emerald-500/60">{stat.icon}</span>
                      <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.1em]">{stat.label}</p>
                    </div>
                    <p className="text-[15px] font-bold text-white tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── TOKEN HOLDERS (combined across chains) ────────────── */}
        {store.tokenHolders.length > 0 && (() => {
          // Merge WBONE into BONE, then combine per-symbol across chains
          const combined = new Map<string, { holders: number; chains: string[] }>();
          for (const t of store.tokenHolders) {
            const key = t.symbol === 'WBONE' ? 'BONE' : t.symbol;
            const prev = combined.get(key);
            if (prev) {
              if (t.holders !== null) prev.holders += t.holders;
              if (!prev.chains.includes(t.chain)) prev.chains.push(t.chain);
            } else {
              combined.set(key, {
                holders: t.holders ?? 0,
                chains: [t.chain],
              });
            }
          }
          const rows = Array.from(combined.entries())
            .sort((a, b) => b[1].holders - a[1].holders);

          return (
            <section className="mb-5" style={{ animation: 'slide-up-fade 0.4s ease-out 340ms both' }}>
              <div
                className="rounded-2xl border border-white/[0.06] overflow-hidden"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(245,158,11,0.04) 0%, rgba(0,0,0,0.2) 100%)',
                }}
              >
                <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/[0.06]">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <Users size={13} className="text-amber-400" />
                  </div>
                  <h3 className="text-xs font-bold text-white">Ecosystem Holders</h3>
                  <span className="ml-auto text-[9px] text-gray-600 font-medium">Combined</span>
                </div>

                <div className="px-4 py-3">
                  {rows.map(([symbol, data], idx) => {
                    const logo = TOKEN_LOGOS[symbol];
                    const chainLabel = data.chains.length > 1
                      ? 'Ethereum + Shibarium'
                      : data.chains[0] === 'ethereum' ? 'Ethereum' : 'Shibarium';
                    return (
                      <div
                        key={symbol}
                        className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-b-0"
                        style={{ animation: `slide-up-fade 0.3s ease-out ${340 + idx * 40}ms both` }}
                      >
                        {logo ? (
                          <img
                            src={logo}
                            alt={symbol}
                            className="w-8 h-8 rounded-full shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-black text-gray-400">{symbol.charAt(0)}</span>
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-white">{symbol}</p>
                          <p className="text-[10px] text-gray-500">{chainLabel}</p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-[13px] font-bold text-white tabular-nums">
                            {fmtHolders(data.holders)}
                          </p>
                          <p className="text-[9px] text-gray-600">holders</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── FOOTER ──────────────────────────────────────────────── */}
        {store.lastUpdated && (
          <div className="flex items-center justify-center gap-1.5 mt-3 mb-2">
            <Shield size={10} className="text-gray-600" />
            <p className="text-[10px] text-gray-600">
              Updated {new Date(store.lastUpdated).toLocaleTimeString()}
            </p>
          </div>
        )}
      </main>

      {/* ── WHALE MOVE DETAIL CARD ──────────────────────────────── */}
      {selectedMove && (() => {
        const m = selectedMove;
        const usd = m.amount * burnStore.shibPrice;
        const date = new Date(m.timestamp * 1000);
        const truncAddr = (a: string) => `${a.slice(0, 10)}...${a.slice(-8)}`;
        const isIn = m.direction === 'inflow';

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedMove(null)} />

            <div
              className="relative w-full max-w-md mx-4 mb-4 bg-[#141414] border border-white/[0.08] rounded-3xl p-5 shadow-2xl"
              style={{ animation: 'slide-up-fade 250ms ease-out' }}
            >
              <button
                onClick={() => setSelectedMove(null)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isIn ? 'bg-red-500/15 border border-red-500/20' : 'bg-green-500/15 border border-green-500/20'
                }`}>
                  {isIn
                    ? <ArrowDownRight size={18} className="text-red-400" />
                    : <ArrowUpRight size={18} className="text-green-400" />
                  }
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {isIn ? 'Exchange Inflow' : 'Exchange Outflow'}
                  </h3>
                  <p className="text-[11px] text-gray-500">{m.exchangeName}</p>
                </div>
              </div>

              {/* Amount */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">Amount</p>
                <p className={`text-xl font-black tabular-nums ${isIn ? 'text-red-400' : 'text-green-400'}`}>
                  {m.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} SHIB
                </p>
                {usd > 0 && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    ≈ ${usd >= 1000 ? fmtNum(usd) : usd.toFixed(2)} USD
                  </p>
                )}
              </div>

              {/* Details */}
              <div className="space-y-3 mb-5">
                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-gray-500">From</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-300 font-mono">{truncAddr(m.from)}</span>
                    <button onClick={() => copyText(m.from, 'from')} className="text-gray-600 hover:text-white transition-colors">
                      {copied === 'from' ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-gray-500">To</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-300 font-mono">{truncAddr(m.to)}</span>
                    <button onClick={() => copyText(m.to, 'to')} className="text-gray-600 hover:text-white transition-colors">
                      {copied === 'to' ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-[11px] text-gray-500">Time</span>
                  <span className="text-[11px] text-gray-300">
                    {date.toLocaleDateString()} {date.toLocaleTimeString()}
                  </span>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-[11px] text-gray-500">Tx Hash</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-300 font-mono">{truncAddr(m.hash)}</span>
                    <button onClick={() => copyText(m.hash, 'hash')} className="text-gray-600 hover:text-white transition-colors">
                      {copied === 'hash' ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Etherscan button */}
              <button
                onClick={() => {
                  navigate(`/wallet/browser?url=${encodeURIComponent(`https://etherscan.io/tx/${m.hash}`)}`);
                  setSelectedMove(null);
                }}
                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                           bg-gradient-to-r from-orange-500 to-red-500 text-white
                           hover:from-orange-400 hover:to-red-400 active:scale-[0.98]"
              >
                <ExternalLink size={14} />
                View on Etherscan
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
};

export default ShibFi;
