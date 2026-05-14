import { type TokenInfo } from './tokens';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// ── Symbol → CoinGecko coin ID ──
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

const PLATFORM_IDS: Record<number, string> = {
  1: 'ethereum',
  109: 'shibarium',
};

const CACHE_TTL_MS = 60_000;
const SPARKLINE_CACHE_TTL_MS = 300_000;
const REQUEST_TIMEOUT = 10_000;

let cachedPrices: Record<string, number> = {};
let cacheTimestamp = 0;

let cachedSparklines: Record<string, number[]> = {};
let sparklineCacheTimestamp = 0;

// ── Prices ──

export async function fetchPrices(
  tokens?: TokenInfo[],
  chainId?: number,
): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && Object.keys(cachedPrices).length > 0) {
    return cachedPrices;
  }

  // Collect base symbols we need
  const needed = new Set<string>();
  if (tokens) {
    for (const t of tokens) needed.add(ALIASES[t.symbol] ?? t.symbol);
  } else {
    Object.keys(GECKO_IDS).forEach((s) => needed.add(s));
  }

  // Build CoinGecko coin ID list for known symbols
  const geckoIds = new Set<string>();
  for (const sym of needed) {
    const id = GECKO_IDS[sym];
    if (id) geckoIds.add(id);
  }

  // Custom tokens not in our known list
  const unknownTokens = tokens?.filter((t) => {
    const base = ALIASES[t.symbol] ?? t.symbol;
    return !GECKO_IDS[base];
  }) ?? [];

  const prices: Record<string, number> = {};

  // Primary: CoinGecko batch by coin IDs (single call, CORS-friendly)
  if (geckoIds.size > 0) {
    try {
      const ids = [...geckoIds].join(',');
      const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
      if (res.ok) {
        const data: Record<string, { usd?: number }> = await res.json();
        // Reverse-map coin ID → symbol(s)
        for (const sym of needed) {
          const id = GECKO_IDS[sym];
          if (id && data[id]?.usd && data[id].usd! > 0) {
            prices[sym] = data[id].usd!;
          }
        }
      }
    } catch {}
  }

  // Custom tokens: CoinGecko contract address (one per call, max 5)
  if (unknownTokens.length > 0 && chainId) {
    const platform = PLATFORM_IDS[chainId];
    if (platform) {
      for (const token of unknownTokens.slice(0, 5)) {
        try {
          const url = `${COINGECKO_BASE}/simple/token_price/${platform}?contract_addresses=${token.address.toLowerCase()}&vs_currencies=usd`;
          const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
          if (!res.ok) continue;
          const data = await res.json();
          const price = data[token.address.toLowerCase()]?.usd;
          if (price && price > 0) prices[token.symbol] = price;
        } catch {}
      }
    }
  }

  // Apply aliases
  for (const [alias, source] of Object.entries(ALIASES)) {
    if (prices[source] && !prices[alias]) {
      prices[alias] = prices[source];
    }
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
  chainId?: number,
): Promise<Record<string, number[]>> {
  const now = Date.now();
  if (
    now - sparklineCacheTimestamp < SPARKLINE_CACHE_TTL_MS &&
    Object.keys(cachedSparklines).length > 0
  ) {
    return cachedSparklines;
  }

  // Collect symbols and their gecko IDs (including aliases)
  const symbolList = tokens ? tokens.map((t) => t.symbol) : Object.keys(GECKO_IDS);
  const idSet = new Set<string>();
  const idToSymbols = new Map<string, string[]>();
  const unknownTokens: TokenInfo[] = [];

  for (const sym of symbolList) {
    const base = ALIASES[sym] ?? sym;
    const geckoId = GECKO_IDS[base];
    if (geckoId) {
      idSet.add(geckoId);
      const syms = idToSymbols.get(geckoId) ?? [];
      syms.push(sym);
      idToSymbols.set(geckoId, syms);
    } else if (tokens) {
      const token = tokens.find((t) => t.symbol === sym);
      if (token) unknownTokens.push(token);
    }
  }

  const sparklines: Record<string, number[]> = {};

  // Batch fetch known tokens (single call)
  if (idSet.size > 0) {
    try {
      const ids = [...idSet].join(',');
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
  }

  // Custom tokens: fetch sequentially by contract address (max 3, 1.5s gap)
  if (unknownTokens.length > 0 && chainId) {
    const platform = PLATFORM_IDS[chainId];
    if (platform) {
      for (const token of unknownTokens.slice(0, 3)) {
        try {
          if (Object.keys(sparklines).length > 0) {
            await new Promise((r) => setTimeout(r, 1500));
          }
          const url = `${COINGECKO_BASE}/coins/${platform}/contract/${token.address.toLowerCase()}/market_chart/?vs_currency=usd&days=7`;
          const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
          if (!res.ok) continue;
          const data = await res.json();
          if (data.prices && Array.isArray(data.prices) && data.prices.length > 0) {
            const allPrices: number[] = data.prices.map((p: [number, number]) => p[1]);
            const step = Math.max(1, Math.floor(allPrices.length / 50));
            sparklines[token.symbol] = allPrices.filter((_: number, i: number) => i % step === 0);
          }
        } catch {}
      }
    }
  }

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
