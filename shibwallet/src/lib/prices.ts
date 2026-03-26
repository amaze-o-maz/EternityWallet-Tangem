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

export async function fetchPrices(): Promise<Record<string, number>> {
  const now = Date.now();

  if (now - cacheTimestamp < CACHE_TTL_MS && Object.keys(cachedPrices).length > 0) {
    return cachedPrices;
  }

  try {
    const ids = COIN_IDS.join(',');
    const url = `${COINGECKO_API}?ids=${ids}&vs_currencies=usd`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data: Record<string, { usd?: number }> = await response.json();

    const prices: Record<string, number> = {};

    for (const [coinId, priceData] of Object.entries(data)) {
      const symbol = COIN_ID_TO_SYMBOL[coinId];
      if (symbol && priceData.usd !== undefined) {
        prices[symbol] = priceData.usd;
      }
    }

    cachedPrices = prices;
    cacheTimestamp = now;

    return prices;
  } catch {
    // On failure, return cached data if available, otherwise empty object
    if (Object.keys(cachedPrices).length > 0) {
      return cachedPrices;
    }
    return {};
  }
}
