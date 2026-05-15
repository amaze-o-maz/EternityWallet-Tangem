// Multi-provider chart data fetcher with automatic fallback.
//
// Tries CoinGecko first, then GeckoTerminal (DEX OHLCV per chain),
// then CryptoCompare (major coins by symbol). The first one that
// returns useful data wins. This way a rate limit on one provider
// doesn't kill the chart — we just fall through to the next source.

import { type TokenInfo } from './tokens';

// Inlined here to avoid a circular import with prices.ts (which re-exports
// from this file). Kept in sync with the same map in prices.ts.
const GECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  SHIB: 'shiba-inu',
  BONE: 'bone-shibaswap',
  LEASH: 'leash',
  TREAT: 'shiba-inu-treat',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
};

const ALIASES: Record<string, string> = {
  WETH: 'ETH',
  WBONE: 'BONE',
  tBONE: 'BONE',
  xSHIB: 'SHIB',
  xLEASH: 'LEASH',
};

function resolveGeckoId(token: TokenInfo): string | null {
  const base = ALIASES[token.symbol] ?? token.symbol;
  return GECKO_IDS[base] ?? token.coingeckoId ?? null;
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const CRYPTOCOMPARE_BASE = 'https://min-api.cryptocompare.com/data/v2';

const REQUEST_TIMEOUT = 12_000;

export type TimedPrice = [number, number]; // [ts_ms, price]
export type TimedOHLC = [number, number, number, number, number]; // [ts_ms, o, h, l, c]
export type ChartTimeframe = '15M' | '1H' | '1D' | '1W' | '1M' | 'ALL';

// ── Per-provider rate-limit tracking ──
// If a provider returns 429 or fails consistently, skip it for a cooldown
// period instead of pounding it and getting blocked harder.

interface ProviderState {
  lastRequestTs: number;
  cooldownUntil: number;
}

const providerStates: Record<string, ProviderState> = {
  coingecko:      { lastRequestTs: 0, cooldownUntil: 0 },
  geckoterminal:  { lastRequestTs: 0, cooldownUntil: 0 },
  cryptocompare:  { lastRequestTs: 0, cooldownUntil: 0 },
};

const MIN_GAP_MS = 800;             // throttle between requests to same provider
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 1-min cooldown after 429

async function providerFetch(
  provider: keyof typeof providerStates,
  url: string,
): Promise<Response | null> {
  const state = providerStates[provider];
  const now = Date.now();
  if (state.cooldownUntil > now) return null;

  const wait = MIN_GAP_MS - (now - state.lastRequestTs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  state.lastRequestTs = Date.now();

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (res.status === 429) {
      state.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      return null;
    }
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

export function isProviderRateLimited(provider: keyof typeof providerStates): boolean {
  return providerStates[provider].cooldownUntil > Date.now();
}

// ── Time helpers ──

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface TFCfg {
  spanMs: number;        // window to display (0 = all returned)
  candleMs: number;      // 0 = adaptive
}

const TF_DISPLAY: Record<ChartTimeframe, TFCfg> = {
  '15M': { spanMs: 15 * MIN,  candleMs: 5 * MIN },
  '1H':  { spanMs: 1 * HOUR,  candleMs: 10 * MIN },
  '1D':  { spanMs: 24 * HOUR, candleMs: 1 * HOUR },
  '1W':  { spanMs: 7 * DAY,   candleMs: 4 * HOUR },
  '1M':  { spanMs: 30 * DAY,  candleMs: 1 * DAY },
  'ALL': { spanMs: 0,         candleMs: 0 },
};

// ── CoinGecko (primary) ──

async function fetchCoinGecko(
  geckoId: string,
  timeframe: ChartTimeframe,
): Promise<TimedPrice[] | null> {
  const apiDays = timeframe === 'ALL' ? 'max'
    : timeframe === '1M' ? 30
    : timeframe === '1W' ? 7
    : 1;

  const tryDays = async (days: number | 'max'): Promise<TimedPrice[] | null> => {
    const url = `${COINGECKO_BASE}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`;
    const res = await providerFetch('coingecko', url);
    if (!res) return null;
    try {
      const json: { prices?: TimedPrice[] } = await res.json();
      return json.prices && json.prices.length >= 2 ? json.prices : null;
    } catch {
      return null;
    }
  };

  let data = await tryDays(apiDays);
  if (!data && apiDays === 'max') {
    data = await tryDays(365);
  }
  return data;
}

// ── GeckoTerminal (per-chain DEX OHLCV) ──

const poolCache = new Map<string, string | null>(); // network:tokenAddr → pool address

function chainIdToGeckoTerminalNetwork(chainId: number): string | null {
  if (chainId === 1) return 'eth';
  if (chainId === 109) return 'shibarium';
  return null;
}

async function findPool(network: string, tokenAddr: string): Promise<string | null> {
  const key = `${network}:${tokenAddr.toLowerCase()}`;
  if (poolCache.has(key)) return poolCache.get(key) ?? null;

  const url = `${GECKOTERMINAL_BASE}/networks/${network}/tokens/${tokenAddr}/pools?page=1`;
  const res = await providerFetch('geckoterminal', url);
  if (!res) return null;

  try {
    const json: { data?: Array<{ attributes?: { address?: string } }> } = await res.json();
    const pool = json.data?.[0]?.attributes?.address ?? null;
    poolCache.set(key, pool);
    return pool;
  } catch {
    return null;
  }
}

interface GTParams {
  unit: 'minute' | 'hour' | 'day';
  aggregate: number;
  limit: number;
}

function gtParamsFor(timeframe: ChartTimeframe): GTParams {
  switch (timeframe) {
    case '15M': return { unit: 'minute', aggregate: 1, limit: 15 };
    case '1H':  return { unit: 'minute', aggregate: 5, limit: 12 };
    case '1D':  return { unit: 'hour',   aggregate: 1, limit: 24 };
    case '1W':  return { unit: 'hour',   aggregate: 4, limit: 42 };
    case '1M':  return { unit: 'day',    aggregate: 1, limit: 30 };
    case 'ALL': return { unit: 'day',    aggregate: 1, limit: 1000 };
  }
}

async function fetchGeckoTerminal(
  chainId: number,
  tokenAddr: string,
  timeframe: ChartTimeframe,
): Promise<TimedOHLC[] | null> {
  const network = chainIdToGeckoTerminalNetwork(chainId);
  if (!network) return null;

  const pool = await findPool(network, tokenAddr);
  if (!pool) return null;

  const p = gtParamsFor(timeframe);
  const url = `${GECKOTERMINAL_BASE}/networks/${network}/pools/${pool}/ohlcv/${p.unit}?aggregate=${p.aggregate}&limit=${p.limit}&token=${tokenAddr}`;
  const res = await providerFetch('geckoterminal', url);
  if (!res) return null;

  try {
    const json: { data?: { attributes?: { ohlcv_list?: number[][] } } } = await res.json();
    const raw = json.data?.attributes?.ohlcv_list;
    if (!raw || raw.length < 2) return null;
    // GeckoTerminal returns [ts_seconds, o, h, l, c, v] — convert to ms and sort ascending
    const candles: TimedOHLC[] = raw
      .map(([ts, o, h, l, c]) => [ts * 1000, o, h, l, c] as TimedOHLC)
      .sort((a, b) => a[0] - b[0]);
    return candles;
  } catch {
    return null;
  }
}

// ── CryptoCompare (by symbol, major coins) ──

interface CCKline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

async function fetchCryptoCompare(
  symbol: string,
  timeframe: ChartTimeframe,
): Promise<TimedOHLC[] | null> {
  // Map our timeframe to CryptoCompare's endpoints
  const { path, aggregate, limit } = (() => {
    switch (timeframe) {
      case '15M': return { path: 'histominute', aggregate: 1, limit: 15 };
      case '1H':  return { path: 'histominute', aggregate: 5, limit: 12 };
      case '1D':  return { path: 'histohour',   aggregate: 1, limit: 24 };
      case '1W':  return { path: 'histohour',   aggregate: 4, limit: 42 };
      case '1M':  return { path: 'histoday',    aggregate: 1, limit: 30 };
      case 'ALL': return { path: 'histoday',    aggregate: 1, limit: 2000 };
    }
  })();

  const url = `${CRYPTOCOMPARE_BASE}/${path}?fsym=${symbol}&tsym=USD&aggregate=${aggregate}&limit=${limit}`;
  const res = await providerFetch('cryptocompare', url);
  if (!res) return null;

  try {
    const json: { Response?: string; Data?: { Data?: CCKline[] } } = await res.json();
    if (json.Response === 'Error') return null;
    const raw = json.Data?.Data;
    if (!raw || raw.length < 2) return null;
    return raw
      .filter((k) => k.close > 0)
      .map((k) => [k.time * 1000, k.open, k.high, k.low, k.close] as TimedOHLC);
  } catch {
    return null;
  }
}

// ── Cache (shared across all providers) ──

const candleCache = new Map<string, { data: TimedOHLC[]; ts: number; source: string }>();
const CACHE_TTL_MS = 300_000; // 5 minutes — generous to ride out rate limits

function tokenCacheKey(token: TokenInfo, chainId: number, timeframe: ChartTimeframe): string {
  return `${chainId}:${token.address.toLowerCase()}:${timeframe}`;
}

// ── Helpers ──

function candlesToLine(candles: TimedOHLC[]): TimedPrice[] {
  return candles.map(([ts, , , , c]) => [ts, c]);
}

function lineToCandles(line: TimedPrice[], candleMs: number): TimedOHLC[] {
  if (line.length === 0 || candleMs <= 0) return [];
  const out: TimedOHLC[] = [];
  let bucketStart = Math.floor(line[0][0] / candleMs) * candleMs;
  let o = line[0][1];
  let h = line[0][1];
  let l = line[0][1];
  let c = line[0][1];
  for (const [ts, p] of line) {
    if (ts >= bucketStart + candleMs) {
      out.push([bucketStart, o, h, l, c]);
      bucketStart = Math.floor(ts / candleMs) * candleMs;
      o = p; h = p; l = p; c = p;
    } else {
      if (p > h) h = p;
      if (p < l) l = p;
      c = p;
    }
  }
  out.push([bucketStart, o, h, l, c]);
  return out;
}

function filterToSpan(candles: TimedOHLC[], spanMs: number): TimedOHLC[] {
  if (spanMs <= 0) return candles;
  const cutoff = Date.now() - spanMs;
  const filtered = candles.filter(([ts]) => ts >= cutoff);
  return filtered.length >= 2 ? filtered : candles;
}

function adaptiveCandleMs(candles: TimedOHLC[], minMs: number): number {
  if (candles.length < 2) return minMs;
  const span = candles[candles.length - 1][0] - candles[0][0];
  const TARGET = 50;
  const intervals = [DAY, 2 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY, 90 * DAY]
    .filter((i) => i >= minMs);
  for (const i of intervals) {
    if (span / i <= TARGET) return i;
  }
  return intervals[intervals.length - 1] ?? minMs;
}

// ── The main fetcher ──

/**
 * Fetch chart data for a token. Tries CoinGecko, then GeckoTerminal,
 * then CryptoCompare in order. Returns the first source that yields
 * 2+ data points. Aggressive 5-min caching with stale fallback.
 */
async function fetchChartFromAnySource(
  token: TokenInfo,
  chainId: number,
  timeframe: ChartTimeframe,
  forceRefresh: boolean,
): Promise<{ candles: TimedOHLC[]; source: string } | null> {
  const cacheKey = tokenCacheKey(token, chainId, timeframe);
  const cached = candleCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { candles: cached.data, source: cached.source };
  }

  const cfg = TF_DISPLAY[timeframe];

  // Try sources in order of best coverage for this token type
  const geckoId = resolveGeckoId(token);
  const network = chainIdToGeckoTerminalNetwork(chainId);
  const isCommonSymbol = ['BTC', 'ETH', 'SHIB', 'BONE', 'USDT', 'USDC', 'DAI', 'WBTC', 'LEASH', 'TREAT', 'WETH']
    .includes(token.symbol);

  type Attempt = () => Promise<{ candles: TimedOHLC[]; source: string } | null>;
  const attempts: Attempt[] = [];

  // 1. CoinGecko by ID
  if (geckoId && !isProviderRateLimited('coingecko')) {
    attempts.push(async () => {
      const line = await fetchCoinGecko(geckoId, timeframe);
      if (!line) return null;
      // Build candles from raw line data
      const minMs = timeframe === 'ALL' ? 7 * DAY : DAY;
      const candleMs = cfg.candleMs > 0 ? cfg.candleMs : adaptiveCandleMs(
        line.map(([t, p]) => [t, 0, 0, 0, p] as TimedOHLC),
        minMs,
      );
      let candles = lineToCandles(line, candleMs);
      candles = filterToSpan(candles, cfg.spanMs);
      return candles.length >= 2 ? { candles, source: 'coingecko' } : null;
    });
  }

  // 2. GeckoTerminal by chain+address (works for any DEX token)
  if (network && !token.isNative && !isProviderRateLimited('geckoterminal')) {
    attempts.push(async () => {
      let candles = await fetchGeckoTerminal(chainId, token.address, timeframe);
      if (!candles) return null;
      if (cfg.spanMs > 0) candles = filterToSpan(candles, cfg.spanMs);
      return candles.length >= 2 ? { candles, source: 'geckoterminal' } : null;
    });
  }

  // 3. CryptoCompare by symbol (only for well-known symbols)
  if (isCommonSymbol && !isProviderRateLimited('cryptocompare')) {
    attempts.push(async () => {
      let candles = await fetchCryptoCompare(token.symbol, timeframe);
      if (!candles) return null;
      if (cfg.spanMs > 0) candles = filterToSpan(candles, cfg.spanMs);
      return candles.length >= 2 ? { candles, source: 'cryptocompare' } : null;
    });
  }

  for (const attempt of attempts) {
    const result = await attempt();
    if (result) {
      candleCache.set(cacheKey, { data: result.candles, source: result.source, ts: Date.now() });
      return result;
    }
  }

  // Everything failed — return stale cache if available
  return cached ? { candles: cached.data, source: cached.source } : null;
}

export async function fetchLineChart(
  token: TokenInfo,
  chainId: number,
  timeframe: ChartTimeframe,
  forceRefresh = false,
): Promise<TimedPrice[]> {
  const result = await fetchChartFromAnySource(token, chainId, timeframe, forceRefresh);
  if (!result) return [];
  const line = candlesToLine(result.candles);

  // Subsample for smooth rendering performance
  const maxPoints = 150;
  if (line.length > maxPoints) {
    const step = Math.max(1, Math.floor(line.length / maxPoints));
    const sampled = line.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== line[line.length - 1]) {
      sampled.push(line[line.length - 1]);
    }
    return sampled;
  }
  return line;
}

export async function fetchCandles(
  token: TokenInfo,
  chainId: number,
  timeframe: ChartTimeframe,
  forceRefresh = false,
): Promise<TimedOHLC[]> {
  const result = await fetchChartFromAnySource(token, chainId, timeframe, forceRefresh);
  return result?.candles ?? [];
}

export const LIVE_REFRESH_MS: Record<ChartTimeframe, number> = {
  '15M': 60_000,
  '1H':  60_000,
  '1D':  120_000,
  '1W':  300_000,
  '1M':  600_000,
  'ALL': 600_000,
};
