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
//
// Chart fetching is implemented in chartProviders.ts with a multi-source
// fallback chain (CoinGecko → GeckoTerminal → CryptoCompare). A rate limit
// on one provider doesn't kill the chart — we just fall through to the next.

export type { ChartTimeframe, TimedPrice, TimedOHLC } from './chartProviders';
export {
  fetchLineChart,
  fetchCandles,
  LIVE_REFRESH_MS,
  isProviderRateLimited,
} from './chartProviders';
