import { create } from 'zustand';
import {
  fetchTotalBurned,
  fetchRecentBurns,
  windowedBurns,
  topBurners as calcTopBurners,
  INITIAL_SUPPLY_FLOAT,
  type BurnTransaction,
  type TopBurner,
  type TimeBucket,
} from '../lib/burns';
import { fetchPrices } from '../lib/prices';

const CACHE_KEY = 'shibwallet_burn_cache';
const STALE_MS = 60_000; // 1 minute
// If a fetch has been "in flight" for longer than this, assume it got stuck
// (e.g. Android paused the WebView mid-request) and allow a new fetch to run.
const STUCK_LOADING_MS = 20_000;

interface BurnState {
  totalBurned: number;
  totalBurnedUSD: number;
  burnPercent: number;
  burns24h: TimeBucket;
  burns7d: TimeBucket;
  burns30d: TimeBucket;
  recentBurns: BurnTransaction[];
  topBurners: TopBurner[];
  shibPrice: number;
  loading: boolean;
  loadingStartedAt: number | null;
  lastUpdated: number | null;
}

interface BurnActions {
  fetchBurnData: () => Promise<void>;
  loadCache: () => boolean;
  needsRefresh: () => boolean;
}

const EMPTY_BUCKET: TimeBucket = { amount: 0, usd: 0, count: 0 };

// Read the cache synchronously at module load so the very first render of
// the Burns page already shows the last-seen data instead of flashing zeros
// while useEffect runs.
function readCacheSync(): Partial<BurnState> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      totalBurned: data.totalBurned ?? 0,
      totalBurnedUSD: data.totalBurnedUSD ?? 0,
      burnPercent: data.burnPercent ?? 0,
      burns24h: data.burns24h ?? EMPTY_BUCKET,
      burns7d: data.burns7d ?? EMPTY_BUCKET,
      burns30d: data.burns30d ?? EMPTY_BUCKET,
      recentBurns: data.recentBurns ?? [],
      topBurners: data.topBurners ?? [],
      shibPrice: data.shibPrice ?? 0,
      lastUpdated: data.lastUpdated ?? null,
    };
  } catch {
    return {};
  }
}

function saveCache(state: BurnState) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        totalBurned: state.totalBurned,
        totalBurnedUSD: state.totalBurnedUSD,
        burnPercent: state.burnPercent,
        burns24h: state.burns24h,
        burns7d: state.burns7d,
        burns30d: state.burns30d,
        recentBurns: state.recentBurns.slice(0, 200),
        topBurners: state.topBurners,
        shibPrice: state.shibPrice,
        lastUpdated: state.lastUpdated,
      }),
    );
  } catch { /* quota exceeded — ignore */ }
}

const INITIAL_CACHED = readCacheSync();

export const useBurnStore = create<BurnState & BurnActions>((set, get) => ({
  totalBurned: INITIAL_CACHED.totalBurned ?? 0,
  totalBurnedUSD: INITIAL_CACHED.totalBurnedUSD ?? 0,
  burnPercent: INITIAL_CACHED.burnPercent ?? 0,
  burns24h: INITIAL_CACHED.burns24h ?? EMPTY_BUCKET,
  burns7d: INITIAL_CACHED.burns7d ?? EMPTY_BUCKET,
  burns30d: INITIAL_CACHED.burns30d ?? EMPTY_BUCKET,
  recentBurns: INITIAL_CACHED.recentBurns ?? [],
  topBurners: INITIAL_CACHED.topBurners ?? [],
  shibPrice: INITIAL_CACHED.shibPrice ?? 0,
  loading: false,
  loadingStartedAt: null,
  lastUpdated: INITIAL_CACHED.lastUpdated ?? null,

  loadCache: () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      set({
        totalBurned: data.totalBurned ?? 0,
        totalBurnedUSD: data.totalBurnedUSD ?? 0,
        burnPercent: data.burnPercent ?? 0,
        burns24h: data.burns24h ?? EMPTY_BUCKET,
        burns7d: data.burns7d ?? EMPTY_BUCKET,
        burns30d: data.burns30d ?? EMPTY_BUCKET,
        recentBurns: data.recentBurns ?? [],
        topBurners: data.topBurners ?? [],
        shibPrice: data.shibPrice ?? 0,
        lastUpdated: data.lastUpdated ?? null,
      });
      return true;
    } catch {
      return false;
    }
  },

  needsRefresh: () => {
    const { lastUpdated, totalBurned } = get();
    if (!lastUpdated || totalBurned === 0) return true;
    return Date.now() - lastUpdated > STALE_MS;
  },

  fetchBurnData: async () => {
    // Skip if another fetch is already running — BUT only if it's recent.
    // A "stuck" loading flag from a fetch that was paused by Android
    // backgrounding should not permanently block new refreshes.
    const state = get();
    if (state.loading && state.loadingStartedAt !== null) {
      const elapsed = Date.now() - state.loadingStartedAt;
      if (elapsed < STUCK_LOADING_MS) return;
    }
    set({ loading: true, loadingStartedAt: Date.now() });

    // Fire the three data sources independently and update state as soon as
    // each one resolves. This way the hero total animates immediately when
    // fetchTotalBurned returns, without waiting for Blockscout or CoinGecko.
    let pending = 3;
    const markDone = () => {
      pending--;
      if (pending === 0) {
        set({ loading: false, loadingStartedAt: null, lastUpdated: Date.now() });
        saveCache(get());
      }
    };

    // ── 1. Total burned (fast — direct RPC balanceOf) ──
    fetchTotalBurned()
      .then((totalBurned) => {
        if (totalBurned <= 0) return;
        const prev = get();
        const burnPercent = (totalBurned / INITIAL_SUPPLY_FLOAT) * 100;
        const totalBurnedUSD = totalBurned * prev.shibPrice;
        set({ totalBurned, burnPercent, totalBurnedUSD });
      })
      .catch((err) => console.error('[BurnStore] fetchTotalBurned failed:', err))
      .finally(markDone);

    // ── 2. Prices (CoinGecko → CryptoCompare fallback) ──
    fetchPrices()
      .then((prices) => {
        const freshShibPrice = prices['SHIB'] ?? 0;
        if (freshShibPrice <= 0) return;
        const prev = get();
        const totalBurnedUSD = prev.totalBurned * freshShibPrice;
        // Recompute windowed USD against any burns we already have.
        const burns24h = windowedBurns(prev.recentBurns, 86_400, freshShibPrice);
        const burns7d = windowedBurns(prev.recentBurns, 604_800, freshShibPrice);
        const burns30d = windowedBurns(prev.recentBurns, 2_592_000, freshShibPrice);
        const topBurners = calcTopBurners(prev.recentBurns, freshShibPrice, 10);
        set({
          shibPrice: freshShibPrice,
          totalBurnedUSD,
          burns24h,
          burns7d,
          burns30d,
          topBurners,
        });
      })
      .catch((err) => console.error('[BurnStore] fetchPrices failed:', err))
      .finally(markDone);

    // ── 3. Recent burns (Blockscout) ──
    fetchRecentBurns(100)
      .then((recentBurns) => {
        const prev = get();
        // If fresh fetch came back empty but we had prior burns, keep them.
        if (recentBurns.length === 0 && prev.recentBurns.length > 0) return;
        const shibPrice = prev.shibPrice;
        const burns24h = windowedBurns(recentBurns, 86_400, shibPrice);
        const burns7d = windowedBurns(recentBurns, 604_800, shibPrice);
        const burns30d = windowedBurns(recentBurns, 2_592_000, shibPrice);
        const topBurners = calcTopBurners(recentBurns, shibPrice, 10);
        set({
          recentBurns: recentBurns.slice(0, 200),
          burns24h,
          burns7d,
          burns30d,
          topBurners,
        });
      })
      .catch((err) => console.error('[BurnStore] fetchRecentBurns failed:', err))
      .finally(markDone);
  },
}));
