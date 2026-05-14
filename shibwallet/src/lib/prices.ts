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

const chartCache = new Map<string, { data: number[]; ts: number }>();
const ohlcCache = new Map<string, { data: OHLCCandle[]; ts: number }>();
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
export type OHLCCandle = [number, number, number, number]; // open, high, low, close

const TIMEFRAME_DAYS: Record<ChartTimeframe, number> = {
  '15M': 1,
  '1H': 1,
  '1D': 1,
  '1W': 7,
  '1M': 30,
  'ALL': 365,
};

// How many minutes of raw data each candle should cover
const CANDLE_INTERVAL_MIN: Record<ChartTimeframe, number> = {
  '15M': 1,    // 1-min candles → ~15 candles in a 15-min window
  '1H': 5,     // 5-min candles → ~12 candles in a 1-hour window
  '1D': 30,    // 30-min candles → ~48 candles in a day
  '1W': 0,     // use native OHLC
  '1M': 0,     // use native OHLC
  'ALL': 0,    // use native OHLC
};

// How many minutes of history to show for short timeframes
const WINDOW_MIN: Record<string, number> = {
  '15M': 15,
  '1H': 60,
  '1D': 1440,
};

export const LIVE_REFRESH_MS: Record<ChartTimeframe, number> = {
  '15M': 30_000,
  '1H': 30_000,
  '1D': 60_000,
  '1W': 120_000,
  '1M': 300_000,
  'ALL': 300_000,
};

export async function fetchChartData(
  geckoId: string,
  timeframe: ChartTimeframe,
  forceRefresh = false,
): Promise<number[]> {
  const cacheKey = `${geckoId}:line:${timeframe}`;
  const cached = chartCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  const days = TIMEFRAME_DAYS[timeframe];
  const url = `${COINGECKO_BASE}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`;
  const res = await throttledFetch(url);
  if (!res) return cached?.data ?? [];

  try {
    const json: { prices?: [number, number][] } = await res.json();
    const raw = json.prices;
    if (!raw || raw.length < 2) return cached?.data ?? [];

    let prices: number[];
    const windowMs = WINDOW_MIN[timeframe];
    if (windowMs) {
      const cutoff = Date.now() - windowMs * 60_000;
      prices = raw.filter(([ts]) => ts >= cutoff).map(([, p]) => p);
      if (prices.length < 2) prices = raw.slice(-3).map(([, p]) => p);
    } else {
      prices = raw.map(([, p]) => p);
    }

    const maxPoints = 80;
    if (prices.length > maxPoints) {
      const step = Math.max(1, Math.floor(prices.length / maxPoints));
      prices = prices.filter((_, i) => i % step === 0);
    }

    if (prices.length >= 2) {
      chartCache.set(cacheKey, { data: prices, ts: Date.now() });
    }
    return prices;
  } catch {
    return cached?.data ?? [];
  }
}

// Synthesize OHLC candles from fine-grained [timestamp, price] data
function buildCandles(
  raw: [number, number][],
  intervalMin: number,
): OHLCCandle[] {
  if (raw.length === 0) return [];
  const intervalMs = intervalMin * 60_000;
  const candles: OHLCCandle[] = [];

  let bucketStart = Math.floor(raw[0][0] / intervalMs) * intervalMs;
  let open = raw[0][1];
  let high = raw[0][1];
  let low = raw[0][1];
  let close = raw[0][1];

  for (const [ts, price] of raw) {
    if (ts >= bucketStart + intervalMs) {
      candles.push([open, high, low, close]);
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
  candles.push([open, high, low, close]);
  return candles;
}

export async function fetchOHLCData(
  geckoId: string,
  timeframe: ChartTimeframe,
  forceRefresh = false,
): Promise<OHLCCandle[]> {
  const cacheKey = `${geckoId}:ohlc:${timeframe}`;
  const cached = ohlcCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  const candleMin = CANDLE_INTERVAL_MIN[timeframe];

  // Short timeframes: build candles from market_chart data
  if (candleMin > 0) {
    const days = TIMEFRAME_DAYS[timeframe];
    const url = `${COINGECKO_BASE}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`;
    const res = await throttledFetch(url);
    if (!res) return cached?.data ?? [];

    try {
      const json: { prices?: [number, number][] } = await res.json();
      let raw = json.prices;
      if (!raw || raw.length < 2) return cached?.data ?? [];

      const windowMs = WINDOW_MIN[timeframe];
      if (windowMs) {
        const cutoff = Date.now() - windowMs * 60_000;
        raw = raw.filter(([ts]) => ts >= cutoff);
        if (raw.length < 2) return cached?.data ?? [];
      }

      const candles = buildCandles(raw, candleMin);
      if (candles.length >= 1) {
        ohlcCache.set(cacheKey, { data: candles, ts: Date.now() });
      }
      return candles;
    } catch {
      return cached?.data ?? [];
    }
  }

  // Longer timeframes: use native CoinGecko OHLC endpoint
  const ohlcDays: Record<string, number> = { '1W': 7, '1M': 30, 'ALL': 365 };
  const days = ohlcDays[timeframe] ?? 30;
  const url = `${COINGECKO_BASE}/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await throttledFetch(url);
  if (!res) return cached?.data ?? [];

  try {
    const raw: [number, number, number, number, number][] = await res.json();
    if (!raw || raw.length < 2) return cached?.data ?? [];

    let candles: OHLCCandle[] = raw.map(([, o, h, l, c]) => [o, h, l, c]);

    const maxCandles = 60;
    if (candles.length > maxCandles) {
      const step = Math.max(1, Math.floor(candles.length / maxCandles));
      candles = candles.filter((_, i) => i % step === 0);
    }

    if (candles.length >= 1) {
      ohlcCache.set(cacheKey, { data: candles, ts: Date.now() });
    }
    return candles;
  } catch {
    return cached?.data ?? [];
  }
}
