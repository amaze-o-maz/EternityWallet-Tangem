import { type TokenInfo } from './tokens';

// ── Symbol → CoinPaprika ID (prices) ──
const PAPRIKA_IDS: Record<string, string> = {
  ETH: 'eth-ethereum',
  SHIB: 'shib-shiba-inu',
  BONE: 'bone-bone-shibaswap',
  LEASH: 'leash-doge-killer',
  TREAT: 'treat-shiba-inu-treat',
  USDT: 'usdt-tether',
  USDC: 'usdc-usd-coin',
  DAI: 'dai-dai',
  WBTC: 'wbtc-wrapped-bitcoin',
};

// ── Symbol → CoinGecko ID (sparklines) ──
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

// Tokens that share the price of another
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

  const prices: Record<string, number> = {};

  // Collect unique base symbols we need prices for
  const symbols = new Set<string>();
  if (tokens) {
    for (const t of tokens) {
      const base = ALIASES[t.symbol] ?? t.symbol;
      symbols.add(base);
    }
  } else {
    Object.keys(PAPRIKA_IDS).forEach((s) => symbols.add(s));
  }

  // Batch fetch from CoinPaprika (known symbols)
  const knownSymbols = [...symbols].filter((s) => PAPRIKA_IDS[s]);
  const unknownTokens = tokens?.filter((t) => {
    const base = ALIASES[t.symbol] ?? t.symbol;
    return !PAPRIKA_IDS[base];
  }) ?? [];

  const paprikaPrices = await fetchFromPaprika(knownSymbols);
  if (paprikaPrices) Object.assign(prices, paprikaPrices);

  // For unknown tokens (custom), try CoinGecko contract address (one at a time)
  if (unknownTokens.length > 0 && chainId) {
    const customPrices = await fetchCustomTokenPrices(unknownTokens, chainId);
    if (customPrices) Object.assign(prices, customPrices);
  }

  // Apply aliases (WETH = ETH price, etc.)
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

async function fetchFromPaprika(symbols: string[]): Promise<Record<string, number> | null> {
  if (symbols.length === 0) return null;

  try {
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const id = PAPRIKA_IDS[sym];
        if (!id) return null;
        try {
          const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${id}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
          });
          if (!res.ok) return null;
          const data = await res.json();
          const price = data?.quotes?.USD?.price;
          return price && price > 0 ? { sym, price } : null;
        } catch {
          return null;
        }
      }),
    );

    const prices: Record<string, number> = {};
    for (const r of results) {
      if (r) prices[r.sym] = r.price;
    }
    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

async function fetchCustomTokenPrices(
  tokens: TokenInfo[],
  chainId: number,
): Promise<Record<string, number> | null> {
  const platform = PLATFORM_IDS[chainId];
  if (!platform) return null;

  const prices: Record<string, number> = {};

  // Fetch one at a time (CoinGecko free tier: 1 address per call)
  for (const token of tokens.slice(0, 5)) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${token.address.toLowerCase()}&vs_currencies=usd`;
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
      if (!res.ok) continue;
      const data = await res.json();
      const price = data[token.address.toLowerCase()]?.usd;
      if (price && price > 0) {
        prices[token.symbol] = price;
      }
    } catch {
      // Skip failed lookups
    }
  }

  return Object.keys(prices).length > 0 ? prices : null;
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

  // Collect unique gecko IDs (including aliased tokens)
  const idSet = new Set<string>();
  const idToSymbols = new Map<string, string[]>();

  const symbolList = tokens
    ? tokens.map((t) => t.symbol)
    : Object.keys(GECKO_IDS);

  for (const sym of symbolList) {
    const base = ALIASES[sym] ?? sym;
    const geckoId = GECKO_IDS[base];
    if (!geckoId) continue;
    idSet.add(geckoId);
    const syms = idToSymbols.get(geckoId) ?? [];
    syms.push(sym);
    idToSymbols.set(geckoId, syms);
  }

  if (idSet.size === 0) return cachedSparklines;

  try {
    const ids = [...idSet].join(',');
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!res.ok) return cachedSparklines;

    const data: Array<{
      id: string;
      sparkline_in_7d?: { price?: number[] };
    }> = await res.json();

    const sparklines: Record<string, number[]> = {};

    for (const coin of data) {
      const rawPrices = coin.sparkline_in_7d?.price;
      if (!rawPrices || rawPrices.length < 2) continue;

      const step = Math.max(1, Math.floor(rawPrices.length / 50));
      const sampled = rawPrices.filter((_: number, i: number) => i % step === 0);

      const symbols = idToSymbols.get(coin.id) ?? [];
      for (const sym of symbols) {
        sparklines[sym] = sampled;
      }
    }

    if (Object.keys(sparklines).length > 0) {
      cachedSparklines = sparklines;
      sparklineCacheTimestamp = now;
    }

    return Object.keys(sparklines).length > 0 ? sparklines : cachedSparklines;
  } catch {
    return cachedSparklines;
  }
}
