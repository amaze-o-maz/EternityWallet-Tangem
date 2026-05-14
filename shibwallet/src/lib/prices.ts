import { type TokenInfo, isNativeToken } from './tokens';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const PLATFORM_IDS: Record<number, string> = {
  1: 'ethereum',
  109: 'shibarium',
};

// Native tokens can't be looked up by address — map them to CoinGecko coin IDs
const NATIVE_COIN_IDS: Record<number, string> = {
  1: 'ethereum',
  109: 'bone-shibaswap',
};

const CACHE_TTL_MS = 60_000;
const SPARKLINE_CACHE_TTL_MS = 300_000;
const REQUEST_TIMEOUT = 10_000;

let cachedPrices: Record<string, number> = {};
let cacheTimestamp = 0;
let cacheChainId = 0;

let cachedSparklines: Record<string, number[]> = {};
let sparklineCacheTimestamp = 0;
let sparklineCacheChainId = 0;

export async function fetchPrices(
  tokens?: TokenInfo[],
  chainId?: number,
): Promise<Record<string, number>> {
  const now = Date.now();
  const chain = chainId ?? 1;

  if (
    now - cacheTimestamp < CACHE_TTL_MS &&
    cacheChainId === chain &&
    Object.keys(cachedPrices).length > 0
  ) {
    return cachedPrices;
  }

  const prices: Record<string, number> = {};

  if (tokens && tokens.length > 0) {
    // Address-based lookup — works for any token including custom
    const native = tokens.filter(isNativeToken);
    const erc20 = tokens.filter((t) => !isNativeToken(t));

    const [nativePrices, tokenPrices] = await Promise.all([
      native.length > 0 ? fetchNativePrice(chain) : Promise.resolve(null),
      erc20.length > 0 ? fetchTokenPricesByAddress(erc20, chain) : Promise.resolve(null),
    ]);

    if (nativePrices) Object.assign(prices, nativePrices);
    if (tokenPrices) Object.assign(prices, tokenPrices);
  } else {
    // Legacy fallback (callers that don't pass tokens, e.g. Swap gas estimation)
    const legacy = await fetchLegacyPrices();
    if (legacy) Object.assign(prices, legacy);
  }

  if (Object.keys(prices).length > 0) {
    cachedPrices = prices;
    cacheTimestamp = now;
    cacheChainId = chain;
  }

  return Object.keys(prices).length > 0 ? prices : cachedPrices;
}

export async function fetchSparklines(
  tokens?: TokenInfo[],
  chainId?: number,
): Promise<Record<string, number[]>> {
  const now = Date.now();
  const chain = chainId ?? 1;

  if (
    now - sparklineCacheTimestamp < SPARKLINE_CACHE_TTL_MS &&
    sparklineCacheChainId === chain &&
    Object.keys(cachedSparklines).length > 0
  ) {
    return cachedSparklines;
  }

  const sparklines: Record<string, number[]> = {};
  const platform = PLATFORM_IDS[chain];
  const items: { symbol: string; url: string }[] = [];

  const tokenList = tokens ?? [];

  for (const token of tokenList) {
    if (isNativeToken(token)) {
      const coinId = NATIVE_COIN_IDS[chain];
      if (coinId) {
        items.push({
          symbol: token.symbol,
          url: `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=7`,
        });
      }
    } else if (platform) {
      items.push({
        symbol: token.symbol,
        url: `${COINGECKO_BASE}/coins/${platform}/contract/${token.address.toLowerCase()}/market_chart/?vs_currency=usd&days=7`,
      });
    }
  }

  const fetches = items.map(async ({ symbol, url }) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
      if (!response.ok) return;
      const data = await response.json();
      if (data.prices && Array.isArray(data.prices) && data.prices.length > 0) {
        const allPrices: number[] = data.prices.map((p: [number, number]) => p[1]);
        const step = Math.max(1, Math.floor(allPrices.length / 50));
        sparklines[symbol] = allPrices.filter((_: number, i: number) => i % step === 0);
      }
    } catch {
      // Individual failure — skip
    }
  });

  await Promise.all(fetches);

  if (Object.keys(sparklines).length > 0) {
    cachedSparklines = sparklines;
    sparklineCacheTimestamp = now;
    sparklineCacheChainId = chain;
  }

  return Object.keys(sparklines).length > 0 ? sparklines : cachedSparklines;
}

// ── Internals ──

async function fetchNativePrice(chainId: number): Promise<Record<string, number> | null> {
  const coinId = NATIVE_COIN_IDS[chainId];
  if (!coinId) return null;

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!res.ok) return null;
    const data: Record<string, { usd?: number }> = await res.json();
    const price = data[coinId]?.usd;
    if (!price) return null;

    const prices: Record<string, number> = {};
    // Map to all native-like symbols for this chain
    if (chainId === 1) {
      prices['ETH'] = price;
      prices['WETH'] = price;
    } else if (chainId === 109) {
      prices['BONE'] = price;
      prices['WBONE'] = price;
    }
    return prices;
  } catch {
    return null;
  }
}

async function fetchTokenPricesByAddress(
  tokens: TokenInfo[],
  chainId: number,
): Promise<Record<string, number> | null> {
  const platform = PLATFORM_IDS[chainId];
  if (!platform) return null;

  try {
    const addresses = tokens.map((t) => t.address.toLowerCase()).join(',');
    const url = `${COINGECKO_BASE}/simple/token_price/${platform}?contract_addresses=${addresses}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!res.ok) return null;
    const data: Record<string, { usd?: number }> = await res.json();

    const prices: Record<string, number> = {};
    for (const token of tokens) {
      const price = data[token.address.toLowerCase()]?.usd;
      if (price && price > 0) {
        prices[token.symbol] = price;
      }
    }

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

// Legacy: coin-ID-based fetch for callers that don't pass tokens
async function fetchLegacyPrices(): Promise<Record<string, number> | null> {
  try {
    const ids = 'shiba-inu,bone-shibaswap,leash,ethereum,treat-2,tether,usd-coin,dai,wrapped-bitcoin';
    const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    if (!res.ok) return null;
    const data: Record<string, { usd?: number }> = await res.json();

    const idToSymbol: Record<string, string> = {
      'shiba-inu': 'SHIB', 'bone-shibaswap': 'BONE', 'leash': 'LEASH',
      'ethereum': 'ETH', 'treat-2': 'TREAT', 'tether': 'USDT',
      'usd-coin': 'USDC', 'dai': 'DAI', 'wrapped-bitcoin': 'WBTC',
    };

    const prices: Record<string, number> = {};
    for (const [coinId, priceData] of Object.entries(data)) {
      const symbol = idToSymbol[coinId];
      if (symbol && priceData.usd && priceData.usd > 0) {
        prices[symbol] = priceData.usd;
      }
    }

    if (prices['ETH']) prices['WETH'] = prices['ETH'];
    if (prices['BONE']) prices['WBONE'] = prices['BONE'];

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}
