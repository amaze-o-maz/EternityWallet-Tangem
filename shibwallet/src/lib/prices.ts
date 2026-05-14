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
const CHART_CACHE_TTL_MS = 120_000;

export type ChartTimeframe = '15M' | '1H' | '1D' | '1W' | '1M' | 'ALL';

const TIMEFRAME_DAYS: Record<ChartTimeframe, number | 'max'> = {
  '15M': 1,
  '1H': 1,
  '1D': 1,
  '1W': 7,
  '1M': 30,
  'ALL': 'max',
};

export async function fetchChartData(
  geckoId: string,
  timeframe: ChartTimeframe,
): Promise<number[]> {
  const cacheKey = `${geckoId}:${timeframe}`;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  const days = TIMEFRAME_DAYS[timeframe];
  const url = `${COINGECKO_BASE}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!res.ok) return [];
    const json: { prices?: [number, number][] } = await res.json();
    const raw = json.prices;
    if (!raw || raw.length < 2) return [];

    let prices = raw.map(([, p]) => p);

    if (timeframe === '15M') {
      prices = prices.slice(-3);
    } else if (timeframe === '1H') {
      prices = prices.slice(-12);
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
    return [];
  }
}
