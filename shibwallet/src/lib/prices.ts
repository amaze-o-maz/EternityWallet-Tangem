const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';

const COIN_IDS = ['shiba-inu', 'bone-shibaswap', 'leash', 'ethereum', 'treat-2'] as const;

const COIN_ID_TO_SYMBOL: Record<string, string> = {
  'shiba-inu': 'SHIB',
  'bone-shibaswap': 'BONE',
  'leash': 'LEASH',
  'ethereum': 'ETH',
  'treat-2': 'TREAT',
};

const CACHE_TTL_MS = 60_000;

let cachedPrices: Record<string, number> = {};
let cacheTimestamp = 0;

const SPARKLINE_CACHE_TTL_MS = 300_000; // 5 minutes
let cachedSparklines: Record<string, number[]> = {};
let sparklineCacheTimestamp = 0;

export async function fetchSparklines(): Promise<Record<string, number[]>> {
  const now = Date.now();
  if (now - sparklineCacheTimestamp < SPARKLINE_CACHE_TTL_MS && Object.keys(cachedSparklines).length > 0) {
    return cachedSparklines;
  }

  const sparklines: Record<string, number[]> = {};

  // Fetch in parallel for each coin
  const fetches = COIN_IDS.map(async (coinId) => {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7`;
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      if (data.prices && Array.isArray(data.prices)) {
        const symbol = COIN_ID_TO_SYMBOL[coinId];
        if (symbol) {
          // Sample to ~50 points for a clean sparkline
          const allPrices: number[] = data.prices.map((p: [number, number]) => p[1]);
          const step = Math.max(1, Math.floor(allPrices.length / 50));
          sparklines[symbol] = allPrices.filter((_: number, i: number) => i % step === 0);
        }
      }
    } catch {
      // Ignore individual failures
    }
  });

  await Promise.all(fetches);

  if (Object.keys(sparklines).length > 0) {
    cachedSparklines = sparklines;
    sparklineCacheTimestamp = now;
  }

  return Object.keys(sparklines).length > 0 ? sparklines : cachedSparklines;
}

export async function fetchPrices(): Promise<Record<string, number>> {
  const now = Date.now();

  if (now - cacheTimestamp < CACHE_TTL_MS && Object.keys(cachedPrices).length > 0) {
    return cachedPrices;
  }

  // Try CoinGecko first
  const fromCoinGecko = await tryCoinGecko();
  if (fromCoinGecko && Object.keys(fromCoinGecko).length > 0) {
    cachedPrices = fromCoinGecko;
    cacheTimestamp = now;
    return fromCoinGecko;
  }

  // Fallback to CryptoCompare — more lenient rate limits, CORS-friendly
  const fromCryptoCompare = await tryCryptoCompare();
  if (fromCryptoCompare && Object.keys(fromCryptoCompare).length > 0) {
    // Merge with any cached values so we don't overwrite known-good prices with 0
    const merged = { ...cachedPrices, ...fromCryptoCompare };
    cachedPrices = merged;
    cacheTimestamp = now;
    return merged;
  }

  // Both sources failed — return stale cache if available
  return cachedPrices;
}

async function tryCoinGecko(): Promise<Record<string, number> | null> {
  try {
    const ids = COIN_IDS.join(',');
    const url = `${COINGECKO_API}?ids=${ids}&vs_currencies=usd`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;

    const data: Record<string, { usd?: number }> = await response.json();
    const prices: Record<string, number> = {};

    for (const [coinId, priceData] of Object.entries(data)) {
      const symbol = COIN_ID_TO_SYMBOL[coinId];
      if (symbol && priceData.usd !== undefined && priceData.usd > 0) {
        prices[symbol] = priceData.usd;
      }
    }

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

async function tryCryptoCompare(): Promise<Record<string, number> | null> {
  try {
    // CryptoCompare supports comma-separated symbols; SHIB, BONE, LEASH, ETH, TREAT
    const symbols = ['SHIB', 'BONE', 'LEASH', 'ETH', 'TREAT'].join(',');
    const url = `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${symbols}&tsyms=USD`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;

    const data: Record<string, { USD?: number }> = await response.json();
    const prices: Record<string, number> = {};

    for (const [symbol, priceData] of Object.entries(data)) {
      if (priceData.USD !== undefined && priceData.USD > 0) {
        prices[symbol] = priceData.USD;
      }
    }

    return Object.keys(prices).length > 0 ? prices : null;
  } catch {
    return null;
  }
}

