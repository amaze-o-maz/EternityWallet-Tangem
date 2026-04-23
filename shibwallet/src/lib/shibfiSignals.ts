import type { TimeBucket } from './burns';
import type { FundingData, OpenInterestData, TickerData } from './marketData';
import type { ExchangeFlowSummary } from './exchangeFlows';
import type { DefiDominance } from './defiDominance';
import type { HolderGrowth } from '../store/shibfiStore';

export interface Signal {
  id: string;
  emoji: string;
  message: string;
  priority: number; // lower = more important
}

interface SignalInput {
  burns24h: TimeBucket;
  burns7d: TimeBucket;
  burns30d: TimeBucket;
  funding: FundingData | null;
  oi: OpenInterestData | null;
  ticker: TickerData | null;
  exchangeFlows: ExchangeFlowSummary | null;
  defiDominance: DefiDominance | null;
  shibPrice: number;
  holderGrowth: HolderGrowth | null;
  shibHolderTotal: number;
}

export function computeSignals(input: SignalInput): Signal[] {
  const signals: Signal[] = [];

  // ── Burn signals (bullish only) ──
  const avg7dPerDay = input.burns7d.amount / 7;
  const burn24h = input.burns24h.amount;

  if (avg7dPerDay > 0 && burn24h > avg7dPerDay * 2) {
    signals.push({
      id: 'burn-accel',
      emoji: '🔥',
      message: `Burn rate accelerating — ${(burn24h / avg7dPerDay).toFixed(1)}× above 7-day average`,
      priority: 1,
    });
  } else if (avg7dPerDay > 0 && burn24h > avg7dPerDay * 1.3) {
    signals.push({
      id: 'burn-rising',
      emoji: '🔥',
      message: 'Burn rate above average — supply pressure building',
      priority: 4,
    });
  }

  // ── Funding signals (bullish only) ──
  if (input.funding) {
    const rate = input.funding.rate;
    if (rate > 0.0005) {
      signals.push({
        id: 'funding-extreme-long',
        emoji: '🚨',
        message: `Extreme long crowding — funding at ${(rate * 100).toFixed(3)}%`,
        priority: 0,
      });
    } else if (rate > 0.0002) {
      signals.push({
        id: 'funding-long',
        emoji: '📈',
        message: `Longs paying heavy premium — funding ${(rate * 100).toFixed(3)}%`,
        priority: 3,
      });
    }
  }

  // ── OI + Price divergence ──
  if (input.oi && input.ticker) {
    const pctChange = Math.abs(input.ticker.priceChangePct);
    if (input.oi.oi > 0 && pctChange < 3) {
      signals.push({
        id: 'oi-flat',
        emoji: '⚡',
        message: 'OI building with flat price — potential breakout setup',
        priority: 3,
      });
    }
  }

  // ── Volume signals (bullish / neutral only) ──
  if (input.ticker) {
    const vol = input.ticker.volume24h;
    const pct = input.ticker.priceChangePct;
    if (vol > 8_000_000_000) {
      signals.push({
        id: 'vol-extreme',
        emoji: '🔊',
        message: `Extreme volume — ${fmtB(vol)} contracts traded in 24h`,
        priority: 1,
      });
    } else if (vol > 4_000_000_000 && pct > 1) {
      signals.push({
        id: 'vol-bullish',
        emoji: '📊',
        message: `Volume surging at ${fmtB(vol)} with price up ${pct.toFixed(1)}% — bullish momentum`,
        priority: 2,
      });
    } else if (vol > 4_000_000_000) {
      signals.push({
        id: 'vol-active',
        emoji: '📊',
        message: `Active market — ${fmtB(vol)} contracts traded in 24h`,
        priority: 4,
      });
    }
  }

  // ── Volume + price compression ──
  if (input.ticker) {
    const range = input.ticker.high24h - input.ticker.low24h;
    const midPrice = (input.ticker.high24h + input.ticker.low24h) / 2;
    if (midPrice > 0 && (range / midPrice) < 0.03) {
      signals.push({
        id: 'compression',
        emoji: '🧠',
        message: 'Market compression detected — tight range with building tension',
        priority: 3,
      });
    }
  }

  // ── Exchange flow signals (bullish only) ──
  if (input.exchangeFlows) {
    const { outflow24h, netLabel } = input.exchangeFlows;
    if (netLabel === 'Net outflow' && outflow24h > 1_000_000_000) {
      signals.push({
        id: 'exch-outflow',
        emoji: '🐋',
        message: `Large exchange outflow — ${fmtB(outflow24h)} SHIB moved off exchanges`,
        priority: 1,
      });
    }
  }

  // ── Holder growth signals (rotating timeframes) ──
  const growth = input.holderGrowth;
  if (growth) {
    const periods: { key: keyof HolderGrowth; label: string }[] = [
      { key: 'day', label: 'today' },
      { key: 'week', label: 'this week' },
      { key: 'month', label: 'this month' },
      { key: 'year', label: 'this year' },
    ];
    const available = periods.filter((p) => growth[p.key] && growth[p.key]! > 0);
    if (available.length > 0) {
      const pick = available[Math.floor(Math.random() * available.length)];
      const delta = growth[pick.key]!;
      signals.push({
        id: 'holders-growth',
        emoji: '🫡',
        message: `ShibArmy grew +${fmtB(delta)} holders ${pick.label}`,
        priority: delta > 5000 ? 1 : 3,
      });
    }
  }
  if (input.shibHolderTotal > 0 && !signals.some((s) => s.id.startsWith('holders'))) {
    if (input.shibHolderTotal > 1_000_000) {
      signals.push({
        id: 'holders-army',
        emoji: '🫡',
        message: `ShibArmy ${fmtB(input.shibHolderTotal)} holders strong — Ethereum + Shibarium combined`,
        priority: 4,
      });
    }
  }

  // ── DeFi dominance ──
  if (input.defiDominance) {
    const { label, dominancePct, rank } = input.defiDominance;
    if (label === 'Top Dog') {
      signals.push({
        id: 'dom-top-dog',
        emoji: '👑',
        message: `SHIB leading the pack — ${dominancePct.toFixed(1)}% of memecoin DEX volume`,
        priority: 1,
      });
    } else if (label === 'Alpha') {
      signals.push({
        id: 'dom-alpha',
        emoji: '🐕',
        message: `SHIB #${rank} by memecoin DEX volume — ${dominancePct.toFixed(1)}% share`,
        priority: 3,
      });
    }
  }

  // ── Price move (bullish only) ──
  if (input.ticker) {
    const pct = input.ticker.priceChangePct;
    if (pct > 10) {
      signals.push({
        id: 'price-surge',
        emoji: '🚀',
        message: `Price surging +${pct.toFixed(1)}% in 24h`,
        priority: 0,
      });
    } else if (pct > 5) {
      signals.push({
        id: 'price-rally',
        emoji: '📈',
        message: `Strong rally — price up ${pct.toFixed(1)}% in 24h`,
        priority: 2,
      });
    }
  }

  signals.sort((a, b) => a.priority - b.priority);
  return signals.slice(0, 6);
}

function fmtB(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  return n.toLocaleString();
}

// ── Simple labels used by the indicator cards ──

export function burnTrendLabel(
  burns24h: TimeBucket,
  burns7d: TimeBucket,
): 'Rising' | 'Flat' | 'Cooling' {
  const avg = burns7d.amount / 7;
  if (avg === 0) return 'Flat';
  const ratio = burns24h.amount / avg;
  if (ratio > 1.3) return 'Rising';
  if (ratio < 0.7) return 'Cooling';
  return 'Flat';
}

export function marketPressureLabel(
  funding: FundingData | null,
): 'Long crowded' | 'Neutral' | 'Short heavy' {
  if (!funding) return 'Neutral';
  return funding.label === 'Long heavy'
    ? 'Long crowded'
    : funding.label === 'Short heavy'
      ? 'Short heavy'
      : 'Neutral';
}

export function momentumLabel(
  ticker: TickerData | null,
): 'Expanding' | 'Compressing' {
  if (!ticker) return 'Compressing';
  const range = ticker.high24h - ticker.low24h;
  const mid = (ticker.high24h + ticker.low24h) / 2;
  if (mid === 0) return 'Compressing';
  return range / mid > 0.05 ? 'Expanding' : 'Compressing';
}
