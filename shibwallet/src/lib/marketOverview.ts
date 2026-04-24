const COINGECKO_GLOBAL = 'https://api.coingecko.com/api/v3/global';
const FEAR_GREED_API = 'https://api.alternative.me/fng/';

export interface MarketOverview {
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24h: number;
  btcDominance: number;
  altcoinIndex: number; // 0-100, derived from BTC dominance shifts
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

export async function fetchMarketOverview(): Promise<MarketOverview | null> {
  try {
    const [globalRes, fgRes] = await Promise.allSettled([
      fetch(COINGECKO_GLOBAL, { signal: AbortSignal.timeout(10_000) }),
      fetch(FEAR_GREED_API, { signal: AbortSignal.timeout(10_000) }),
    ]);

    let totalMarketCap = 0;
    let totalVolume24h = 0;
    let marketCapChange24h = 0;
    let btcDominance = 0;

    if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
      const json = (await globalRes.value.json()) as CoinGeckoGlobal;
      const d = json.data;
      if (d) {
        totalMarketCap = d.total_market_cap?.usd ?? 0;
        totalVolume24h = d.total_volume?.usd ?? 0;
        marketCapChange24h = d.market_cap_change_percentage_24h_usd ?? 0;
        btcDominance = d.market_cap_percentage?.btc ?? 0;
      }
    }

    if (totalMarketCap === 0) return null;

    // Altcoin index: inverse of BTC dominance, scaled 0-100
    // When BTC dominance is low (~40%), altcoins are strong (index ~75)
    // When BTC dominance is high (~65%), altcoins are weak (index ~20)
    const altcoinIndex = Math.round(
      Math.max(0, Math.min(100, ((65 - btcDominance) / 25) * 100)),
    );

    let fearGreedValue = 50;
    let fearGreedLabel = 'Neutral';

    if (fgRes.status === 'fulfilled' && fgRes.value.ok) {
      const fgJson = (await fgRes.value.json()) as FearGreedResponse;
      if (fgJson.data && fgJson.data.length > 0) {
        fearGreedValue = parseInt(fgJson.data[0].value ?? '50', 10);
        fearGreedLabel = fgJson.data[0].value_classification ?? 'Neutral';
      }
    }

    return {
      totalMarketCap,
      totalVolume24h,
      marketCapChange24h,
      btcDominance,
      altcoinIndex,
      fearGreedValue,
      fearGreedLabel,
    };
  } catch {
    return null;
  }
}
