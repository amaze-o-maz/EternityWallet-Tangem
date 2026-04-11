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
      // Otherwise, fall through and start a new fetch.
    }
    set({ loading: true, loadingStartedAt: Date.now() });

    try {
      const [totalBurned, recentBurns, prices] = await Promise.all([
        fetchTotalBurned(),
        fetchRecentBurns(100),
        fetchPrices(),
      ]);

      // If prices failed to load, fall back to the previous shibPrice so that
      // USD values don't collapse to $0.00 on transient network failures.
      const freshShibPrice = prices['SHIB'] ?? 0;
      const prev = get();
      const shibPrice = freshShibPrice > 0 ? freshShibPrice : prev.shibPrice;

      // If the fresh recentBurns came back empty (API paging glitch, upstream
      // outage, etc) but we previously had some, keep the old list + windows.
      const useFreshBurns = recentBurns.length > 0 || prev.recentBurns.length === 0;
      const finalRecent = useFreshBurns ? recentBurns : prev.recentBurns;

      // Same for totalBurned — if the RPC returned 0 unexpectedly, preserve
      // the prior value rather than zeroing out the hero number.
      const finalTotalBurned = totalBurned > 0 ? totalBurned : prev.totalBurned;

      const totalBurnedUSD = finalTotalBurned * shibPrice;
      const burnPercent = (finalTotalBurned / INITIAL_SUPPLY_FLOAT) * 100;

      const b24h = useFreshBurns ? windowedBurns(finalRecent, 86_400, shibPrice) : prev.burns24h;
      const b7d = useFreshBurns ? windowedBurns(finalRecent, 604_800, shibPrice) : prev.burns7d;
      const b30d = useFreshBurns ? windowedBurns(finalRecent, 2_592_000, shibPrice) : prev.burns30d;

      const top = useFreshBurns ? calcTopBurners(finalRecent, shibPrice, 10) : prev.topBurners;

      const newState: Partial<BurnState> = {
        totalBurned: finalTotalBurned,
        totalBurnedUSD,
        burnPercent,
        burns24h: b24h,
        burns7d: b7d,
        burns30d: b30d,
        // Keep enough history to render the 30D chart / windows correctly.
        recentBurns: finalRecent.slice(0, 200),
        topBurners: top,
        shibPrice,
        loading: false,
        loadingStartedAt: null,
        lastUpdated: Date.now(),
      };

      set(newState);
      saveCache(get());
    } catch (err) {
      console.error('[BurnStore] fetchBurnData failed:', err);
      set({ loading: false, loadingStartedAt: null });
    }
  },
}));
