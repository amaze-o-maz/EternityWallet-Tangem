import { type TokenInfo } from './tokens';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// ── Symbol → CoinGecko coin ID (built-in tokens) ──
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

// Tokens that share the price/sparkline of another
const ALIASES: Record<string, string> = {
  WETH: 'ETH',
  WBONE: 'BONE',
  tBONE: 'BONE',
  xSHIB: 'SHIB',
  xLEASH: 'LEASH',
};

const CACHE_TTL_MS = 60_000;
const SPARKLINE_CACHE_TTL_MS = 300_000;
const REQUEST_TIMEOUT = 10_000;

let cachedPrices: Record<string, number> = {};
let cacheTimestamp = 0;

let cachedSparklines: Record<string, number[]> = {};
let sparklineCacheTimestamp = 0;

export function resolveGeckoId(token: TokenInfo): string | null {
  const base = ALIASES[token.symbol] ?? token.symbol;
  return GECKO_IDS[base] ?? token.coingeckoId ?? null;
}

// ── Prices ──

export async function fetchPrices(
  tokens?: TokenInfo[],
  _chainId?: number,
): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && Object.keys(cachedPrices).length > 0) {
    return cachedPrices;
  }

  // Build coin ID → symbol(s) mapping
  const idToSymbols = new Map<string, string[]>();

  if (tokens) {
    for (const t of tokens) {
      const base = ALIASES[t.symbol] ?? t.symbol;
      const geckoId = GECKO_IDS[base] ?? t.coingeckoId;
      if (!geckoId) continue;
      const syms = idToSymbols.get(geckoId) ?? [];
      syms.push(base);
      idToSymbols.set(geckoId, syms);
    }
  } else {
    for (const [sym, id] of Object.entries(GECKO_IDS)) {
      idToSymbols.set(id, [sym]);
    }
  }

  const prices: Record<string, number> = {};

  if (idToSymbols.size > 0) {
    try {
      const ids = [...idToSymbols.keys()].join(',');
      const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
      if (res.ok) {
        const data: Record<string, { usd?: number }> = await res.json();
        for (const [id, syms] of idToSymbols) {
          const price = data[id]?.usd;
          if (price && price > 0) {
            for (const sym of syms) prices[sym] = price;
          }
        }
      }
    } catch {}
  }

  // Apply aliases
  for (const [alias, source] of Object.entries(ALIASES)) {
    if (prices[source] && !prices[alias]) prices[alias] = prices[source];
  }

  if (Object.keys(prices).length > 0) {
    cachedPrices = prices;
    cacheTimestamp = now;
  }

  return Object.keys(prices).length > 0 ? prices : cachedPrices;
}

// ── Sparklines ──

export async function fetchSparklines(
  tokens?: TokenInfo[],
  _chainId?: number,
): Promise<Record<string, number[]>> {
  const now = Date.now();
  if (
    now - sparklineCacheTimestamp < SPARKLINE_CACHE_TTL_MS &&
    Object.keys(cachedSparklines).length > 0
  ) {
    return cachedSparklines;
  }

  // Build coin ID → symbol(s) mapping
  const idToSymbols = new Map<string, string[]>();

  if (tokens) {
    for (const t of tokens) {
      const geckoId = resolveGeckoId(t);
      if (!geckoId) continue;
      const syms = idToSymbols.get(geckoId) ?? [];
      syms.push(t.symbol);
      idToSymbols.set(geckoId, syms);
    }
  } else {
    for (const [sym, id] of Object.entries(GECKO_IDS)) {
      idToSymbols.set(id, [sym]);
    }
  }

  if (idToSymbols.size === 0) return cachedSparklines;

  const sparklines: Record<string, number[]> = {};

  try {
    const ids = [...idToSymbols.keys()].join(',');
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (res.ok) {
      const data: Array<{
        id: string;
        sparkline_in_7d?: { price?: number[] };
      }> = await res.json();

      for (const coin of data) {
        const rawPrices = coin.sparkline_in_7d?.price;
        if (!rawPrices || rawPrices.length < 2) continue;
        const step = Math.max(1, Math.floor(rawPrices.length / 50));
        const sampled = rawPrices.filter((_: number, i: number) => i % step === 0);
        const symbols = idToSymbols.get(coin.id) ?? [];
        for (const sym of symbols) sparklines[sym] = sampled;
      }
    }
  } catch {}

  // Apply aliases in both directions so cache works across chain switches
  for (const [alias, source] of Object.entries(ALIASES)) {
    if (sparklines[source] && !sparklines[alias]) sparklines[alias] = sparklines[source];
    if (sparklines[alias] && !sparklines[source]) sparklines[source] = sparklines[alias];
  }

  if (Object.keys(sparklines).length > 0) {
    cachedSparklines = sparklines;
    sparklineCacheTimestamp = now;
  }

  return Object.keys(sparklines).length > 0 ? sparklines : cachedSparklines;
}

// ── Chart data for detail page (per-token, variable timeframes) ──

const marketChartCache = new Map<string, { data: TimedPrice[]; ts: number }>();
const CHART_CACHE_TTL_MS = 120_000;

// Throttle: minimum gap between CoinGecko chart requests
let lastChartRequestTs = 0;
const MIN_REQUEST_GAP_MS = 1_500;

async function throttledFetch(url: string): Promise<Response | null> {
  const now = Date.now();
  const wait = MIN_REQUEST_GAP_MS - (now - lastChartRequestTs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastChartRequestTs = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

export type ChartTimeframe = '15M' | '1H' | '1D' | '1W' | '1M' | 'ALL';
export type TimedPrice = [number, number]; // [timestamp_ms, price]
export type TimedOHLC = [number, number, number, number, number]; // [ts, open, high, low, close]

// User-facing paradigm: label = time window.
// 15m shows last 15 minutes, 1D shows last 24 hours, ALL shows full history.
// Candle interval is chosen to give the best density given CoinGecko's
// data resolution (5-min for days=1, hourly for days=2-90, daily for days>90).
interface TimeframeConfig {
  spanMs: number;          // 0 = show all data returned
  candleMs: number;        // 0 = adaptive based on actual history length
  apiDays: number | 'max'; // CoinGecko days param
  fallbackDays?: number;   // try this if primary returns empty
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const TF_CONFIG: Record<ChartTimeframe, TimeframeConfig> = {
  '15M': { spanMs: 15 * MIN,  candleMs: 5 * MIN,  apiDays: 1 },
  '1H':  { spanMs: 1 * HOUR,  candleMs: 10 * MIN, apiDays: 1 },
  '1D':  { spanMs: 24 * HOUR, candleMs: 1 * HOUR, apiDays: 1 },
  '1W':  { spanMs: 7 * DAY,   candleMs: 4 * HOUR, apiDays: 7 },
  '1M':  { spanMs: 30 * DAY,  candleMs: 1 * DAY,  apiDays: 30 },
  'ALL': { spanMs: 0,         candleMs: 0,         apiDays: 'max', fallbackDays: 365 },
};

export const LIVE_REFRESH_MS: Record<ChartTimeframe, number> = {
  '15M': 30_000,
  '1H':  30_000,
  '1D':  60_000,
  '1W':  120_000,
  '1M':  300_000,
  'ALL': 300_000,
};

export function getChartConfig(timeframe: ChartTimeframe) {
  return TF_CONFIG[timeframe];
}

// Pick a candle interval that yields ~60 candles for the given history length
function adaptiveCandleMs(data: TimedPrice[]): number {
  if (data.length < 2) return DAY;
  const span = data[data.length - 1][0] - data[0][0];
  const TARGET = 60;
  const intervals = [
    1 * DAY,
    2 * DAY,
    3 * DAY,
    7 * DAY,
    14 * DAY,
    30 * DAY,
    60 * DAY,
    90 * DAY,
  ];
  for (const i of intervals) {
    if (span / i <= TARGET) return i;
  }
  return 90 * DAY;
}

// Shared market_chart fetcher used by both line and candle modes
async function fetchMarketChart(
  geckoId: string,
  timeframe: ChartTimeframe,
  forceRefresh: boolean,
): Promise<TimedPrice[]> {
  const cacheKey = `${geckoId}:${timeframe}`;
  const cached = marketChartCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  const cfg = TF_CONFIG[timeframe];

  const tryFetch = async (days: number | 'max'): Promise<TimedPrice[] | null> => {
    const url = `${COINGECKO_BASE}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`;
    const res = await throttledFetch(url);
    if (!res) return null;
    try {
      const json: { prices?: TimedPrice[] } = await res.json();
      return json.prices && json.prices.length >= 2 ? json.prices : null;
    } catch {
      return null;
    }
  };

  let raw = await tryFetch(cfg.apiDays);
  if (!raw && cfg.fallbackDays !== undefined) {
    raw = await tryFetch(cfg.fallbackDays);
  }
  if (!raw) return cached?.data ?? [];

  let data = raw;
  if (cfg.spanMs > 0) {
    const cutoff = Date.now() - cfg.spanMs;
    const filtered = data.filter(([ts]) => ts >= cutoff);
    if (filtered.length >= 2) data = filtered;
  }

  if (data.length >= 2) {
    marketChartCache.set(cacheKey, { data, ts: Date.now() });
  }
  return data;
}

export async function fetchLineChart(
  geckoId: string,
  timeframe: ChartTimeframe,
  forceRefresh = false,
): Promise<TimedPrice[]> {
  const data = await fetchMarketChart(geckoId, timeframe, forceRefresh);
  if (data.length < 2) return data;

  // Subsample for smooth rendering performance
  const maxPoints = 150;
  if (data.length > maxPoints) {
    const step = Math.max(1, Math.floor(data.length / maxPoints));
    const sampled = data.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== data[data.length - 1]) {
      sampled.push(data[data.length - 1]);
    }
    return sampled;
  }
  return data;
}

export async function fetchCandles(
  geckoId: string,
  timeframe: ChartTimeframe,
  forceRefresh = false,
): Promise<TimedOHLC[]> {
  const data = await fetchMarketChart(geckoId, timeframe, forceRefresh);
  if (data.length < 2) return [];
  const cfg = TF_CONFIG[timeframe];
  const candleMs = cfg.candleMs > 0 ? cfg.candleMs : adaptiveCandleMs(data);
  return buildCandles(data, candleMs);
}

function buildCandles(raw: TimedPrice[], intervalMs: number): TimedOHLC[] {
  if (raw.length === 0 || intervalMs <= 0) return [];
  const candles: TimedOHLC[] = [];

  let bucketStart = Math.floor(raw[0][0] / intervalMs) * intervalMs;
  let open = raw[0][1];
  let high = raw[0][1];
  let low = raw[0][1];
  let close = raw[0][1];

  for (const [ts, price] of raw) {
    if (ts >= bucketStart + intervalMs) {
      candles.push([bucketStart, open, high, low, close]);
      bucketStart = Math.floor(ts / intervalMs) * intervalMs;
      open = price;
      high = price;
      low = price;
      close = price;
    } else {
      if (price > high) high = price;
      if (price < low) low = price;
      close = price;
    }
  }
  candles.push([bucketStart, open, high, low, close]);
  return candles;
}
