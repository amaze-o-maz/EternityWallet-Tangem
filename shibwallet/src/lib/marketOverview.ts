const COINGECKO_GLOBAL = 'https://api.coingecko.com/api/v3/global';
const FEAR_GREED_API = 'https://api.alternative.me/fng/';
const COINCAP_GLOBAL = 'https://api.coincap.io/v2/assets?limit=1';

export interface MarketOverview {
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24h: number;
  btcDominance: number;
  altcoinIndex: number;
  fearGreedValue: number;
  fearGreedLabel: string;
}

interface CoinGeckoGlobal {
  data?: {
    total_market_cap?: Record<string, number>;
    total_volume?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
    market_cap_percentage?: Record<string, number>;
  };
}

interface FearGreedResponse {
  data?: { value?: string; value_classification?: string }[];
}

async function fetchGlobalFromCoinGecko(): Promise<{
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24h: number;
  btcDominance: number;
} | null> {
  try {
    const res = await fetch(COINGECKO_GLOBAL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as CoinGeckoGlobal;
    const d = json.data;
    if (!d) return null;
    return {
      totalMarketCap: d.total_market_cap?.usd ?? 0,
      totalVolume24h: d.total_volume?.usd ?? 0,
      marketCapChange24h: d.market_cap_change_percentage_24h_usd ?? 0,
      btcDominance: d.market_cap_percentage?.btc ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchGlobalFromCoinCap(): Promise<{
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24h: number;
  btcDominance: number;
} | null> {
  try {
    const res = await fetch('https://api.coincap.io/v2/assets?limit=20', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const assets = json.data as { marketCapUsd?: string; volumeUsd24Hr?: string; changePercent24Hr?: string; id?: string }[];
    if (!Array.isArray(assets) || assets.length === 0) return null;

    let totalMarketCap = 0;
    let totalVolume24h = 0;
    let btcCap = 0;
    let weightedChange = 0;

    for (const a of assets) {
      const cap = parseFloat(a.marketCapUsd ?? '0');
      const vol = parseFloat(a.volumeUsd24Hr ?? '0');
      const chg = parseFloat(a.changePercent24Hr ?? '0');
      totalMarketCap += cap;
      totalVolume24h += vol;
      weightedChange += chg * cap;
      if (a.id === 'bitcoin') btcCap = cap;
    }

    // Top 20 is ~85% of total market; scale up estimate
    totalMarketCap *= 1.18;
    totalVolume24h *= 1.25;
    const marketCapChange24h = totalMarketCap > 0 ? weightedChange / (totalMarketCap / 1.18) : 0;
    const btcDominance = totalMarketCap > 0 ? (btcCap / totalMarketCap) * 100 * 1.18 : 60;

    return { totalMarketCap, totalVolume24h, marketCapChange24h, btcDominance };
  } catch {
    return null;
  }
}

async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  try {
    const res = await fetch(FEAR_GREED_API, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { value: 50, label: 'Neutral' };
    const json = (await res.json()) as FearGreedResponse;
    if (json.data && json.data.length > 0) {
      return {
        value: parseInt(json.data[0].value ?? '50', 10),
        label: json.data[0].value_classification ?? 'Neutral',
      };
    }
  } catch {}
  return { value: 50, label: 'Neutral' };
}

export async function fetchMarketOverview(): Promise<MarketOverview | null> {
  const [globalData, fg] = await Promise.all([
    fetchGlobalFromCoinGecko().then((r) => r ?? fetchGlobalFromCoinCap()),
    fetchFearGreed(),
  ]);

  if (!globalData) return null;

  const altcoinIndex = Math.round(
    Math.max(0, Math.min(100, ((65 - globalData.btcDominance) / 25) * 100)),
  );

  return {
    ...globalData,
    altcoinIndex,
    fearGreedValue: fg.value,
    fearGreedLabel: fg.label,
  };
}
