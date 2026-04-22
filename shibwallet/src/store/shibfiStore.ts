import { create } from 'zustand';
import {
  fetchMarketData,
  type FundingData,
  type OpenInterestData,
  type TickerData,
} from '../lib/marketData';
import {
  fetchShibariumStats,
  fetchTokenHolders,
  type ShibariumStats,
  type TokenHolderInfo,
} from '../lib/shibarium';
import {
  fetchExchangeFlows,
  type ExchangeFlowSummary,
} from '../lib/exchangeFlows';
import {
  fetchDefiDominance,
  type DefiDominance,
} from '../lib/defiDominance';

const CACHE_KEY = 'shibwallet_shibfi_cache_v3';
const STALE_MS = 60_000;

interface ShibFiState {
  funding: FundingData | null;
  openInterest: OpenInterestData | null;
  ticker: TickerData | null;
  shibarium: ShibariumStats | null;
  tokenHolders: TokenHolderInfo[];
  exchangeFlows: ExchangeFlowSummary | null;
  defiDominance: DefiDominance | null;
  loading: boolean;
  lastUpdated: number | null;
}

interface ShibFiActions {
  fetchAll: () => Promise<void>;
  loadCache: () => boolean;
  needsRefresh: () => boolean;
}

function readCacheSync(): Partial<ShibFiState> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ShibFiState>;
  } catch {
    return {};
  }
}

function saveCache(state: ShibFiState) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        funding: state.funding,
        openInterest: state.openInterest,
        ticker: state.ticker,
        shibarium: state.shibarium,
        tokenHolders: state.tokenHolders,
        exchangeFlows: state.exchangeFlows,
        defiDominance: state.defiDominance,
        lastUpdated: state.lastUpdated,
      }),
    );
  } catch {}
}

const INITIAL = readCacheSync();

export const useShibFiStore = create<ShibFiState & ShibFiActions>((set, get) => ({
  funding: INITIAL.funding ?? null,
  openInterest: INITIAL.openInterest ?? null,
  ticker: INITIAL.ticker ?? null,
  shibarium: INITIAL.shibarium ?? null,
  tokenHolders: INITIAL.tokenHolders ?? [],
  exchangeFlows: INITIAL.exchangeFlows ?? null,
  defiDominance: INITIAL.defiDominance ?? null,
  loading: false,
  lastUpdated: INITIAL.lastUpdated ?? null,

  loadCache: () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      set({
        funding: data.funding ?? null,
        openInterest: data.openInterest ?? null,
        ticker: data.ticker ?? null,
        shibarium: data.shibarium ?? null,
        tokenHolders: data.tokenHolders ?? [],
        exchangeFlows: data.exchangeFlows ?? null,
        defiDominance: data.defiDominance ?? null,
        lastUpdated: data.lastUpdated ?? null,
      });
      return true;
    } catch {
      return false;
    }
  },

  needsRefresh: () => {
    const { lastUpdated } = get();
    if (!lastUpdated) return true;
    return Date.now() - lastUpdated > STALE_MS;
  },

  fetchAll: async () => {
    if (get().loading) return;
    set({ loading: true });

    // All sources in parallel — each updates its own slice.
    let pending = 5;
    const markDone = () => {
      pending--;
      if (pending === 0) {
        set({ loading: false, lastUpdated: Date.now() });
        saveCache(get());
      }
    };

    // 1. Market data (funding + multi-venue OI + ticker)
    fetchMarketData()
      .then(({ funding, openInterest, ticker }) => {
        set({ funding, openInterest, ticker });
      })
      .catch((e) => console.error('[ShibFi] market data:', e))
      .finally(markDone);

    // 2. Shibarium network stats
    fetchShibariumStats()
      .then((stats) => {
        if (stats) set({ shibarium: stats });
      })
      .catch((e) => console.error('[ShibFi] shibarium stats:', e))
      .finally(markDone);

    // 3. Token holders
    fetchTokenHolders()
      .then((holders) => {
        if (holders.length > 0) set({ tokenHolders: holders });
      })
      .catch((e) => console.error('[ShibFi] token holders:', e))
      .finally(markDone);

    // 4. Exchange flows
    fetchExchangeFlows()
      .then((flows) => {
        if (flows) set({ exchangeFlows: flows });
      })
      .catch((e) => console.error('[ShibFi] exchange flows:', e))
      .finally(markDone);

    // 5. DeFi dominance (SHIB share of ETH memecoin DEX volume)
    fetchDefiDominance()
      .then((dom) => {
        if (dom) set({ defiDominance: dom });
      })
      .catch((e) => console.error('[ShibFi] defi dominance:', e))
      .finally(markDone);
  },
}));
