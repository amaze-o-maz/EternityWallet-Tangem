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
  lastUpdated: number | null;
}

interface BurnActions {
  fetchBurnData: () => Promise<void>;
  loadCache: () => boolean;
  needsRefresh: () => boolean;
}

const EMPTY_BUCKET: TimeBucket = { amount: 0, usd: 0, count: 0 };

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
        recentBurns: state.recentBurns.slice(0, 50),
        topBurners: state.topBurners,
        shibPrice: state.shibPrice,
        lastUpdated: state.lastUpdated,
      }),
    );
  } catch { /* quota exceeded — ignore */ }
}

export const useBurnStore = create<BurnState & BurnActions>((set, get) => ({
  totalBurned: 0,
  totalBurnedUSD: 0,
  burnPercent: 0,
  burns24h: EMPTY_BUCKET,
  burns7d: EMPTY_BUCKET,
  burns30d: EMPTY_BUCKET,
  recentBurns: [],
  topBurners: [],
  shibPrice: 0,
  loading: false,
  lastUpdated: null,

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
    if (get().loading) return;
    set({ loading: true });

    try {
      const [totalBurned, recentBurns, prices] = await Promise.all([
        fetchTotalBurned(),
        fetchRecentBurns(150),
        fetchPrices(),
      ]);

      // If prices failed to load, fall back to the previous shibPrice so that
      // USD values don't collapse to $0.00 on transient network failures.
      const freshShibPrice = prices['SHIB'] ?? 0;
      const prevShibPrice = get().shibPrice;
      const shibPrice = freshShibPrice > 0 ? freshShibPrice : prevShibPrice;

      const totalBurnedUSD = totalBurned * shibPrice;
      const burnPercent = (totalBurned / INITIAL_SUPPLY_FLOAT) * 100;

      const b24h = windowedBurns(recentBurns, 86_400, shibPrice);
      const b7d = windowedBurns(recentBurns, 604_800, shibPrice);
      const b30d = windowedBurns(recentBurns, 2_592_000, shibPrice);

      const top = calcTopBurners(recentBurns, shibPrice, 10);

      const newState: Partial<BurnState> = {
        totalBurned,
        totalBurnedUSD,
        burnPercent,
        burns24h: b24h,
        burns7d: b7d,
        burns30d: b30d,
        recentBurns: recentBurns.slice(0, 50),
        topBurners: top,
        shibPrice,
        loading: false,
        lastUpdated: Date.now(),
      };

      set(newState);
      saveCache(get());
    } catch (err) {
      console.error('[BurnStore] fetchBurnData failed:', err);
      set({ loading: false });
    }
  },
}));
