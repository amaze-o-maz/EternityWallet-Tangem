export interface MarketOverview {
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24h: number;
  btcDominance: number;
  altcoinIndex: number;
  fearGreedValue: number;
  fearGreedLabel: string;
}

const FEAR_GREED_API = 'https://api.alternative.me/fng/';

async function fetchBtcMarketData(): Promise<{
  btcMarketCap: number;
  btcVolume: number;
  btcChange24h: number;
  ethMarketCap: number;
  ethVolume: number;
} | null> {
  // Use the same CoinGecko simple/price endpoint that works for token prices
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true';
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error('CoinGecko failed');
    const data = await res.json();
    return {
      btcMarketCap: data.bitcoin?.usd_market_cap ?? 0,
      btcVolume: data.bitcoin?.usd_24h_vol ?? 0,
      btcChange24h: data.bitcoin?.usd_24h_change ?? 0,
      ethMarketCap: data.ethereum?.usd_market_cap ?? 0,
      ethVolume: data.ethereum?.usd_24h_vol ?? 0,
    };
  } catch {
    // Fallback: CryptoCompare
    try {
      const url =
        'https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC,ETH&tsyms=USD';
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const data = await res.json();
      const btc = data.RAW?.BTC?.USD;
      const eth = data.RAW?.ETH?.USD;
      if (!btc) return null;
      return {
        btcMarketCap: btc.MKTCAP ?? 0,
        btcVolume: btc.TOTALVOLUME24HTO ?? 0,
        btcChange24h: btc.CHANGEPCT24HOUR ?? 0,
        ethMarketCap: eth?.MKTCAP ?? 0,
        ethVolume: eth?.TOTALVOLUME24HTO ?? 0,
      };
    } catch {
      return null;
    }
  }
}

async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  try {
    const res = await fetch(FEAR_GREED_API, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error('F&G failed');
    const json = await res.json();
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
  const [btcData, fg] = await Promise.all([
    fetchBtcMarketData(),
    fetchFearGreed(),
  ]);

  if (!btcData || btcData.btcMarketCap === 0) return null;

  // Estimate total market cap: BTC is roughly 55-65% of total
  // Use BTC+ETH as ~70% of total to get a better estimate
  const knownCap = btcData.btcMarketCap + btcData.ethMarketCap;
  const knownVol = btcData.btcVolume + btcData.ethVolume;
  const btcEthShare = 0.70;
  const totalMarketCap = knownCap / btcEthShare;
  const totalVolume24h = knownVol / btcEthShare;
  const btcDominance = (btcData.btcMarketCap / totalMarketCap) * 100;
  const marketCapChange24h = btcData.btcChange24h;

  const altcoinIndex = Math.round(
    Math.max(0, Math.min(100, ((65 - btcDominance) / 25) * 100)),
  );

  return {
    totalMarketCap,
    totalVolume24h,
    marketCapChange24h,
    btcDominance,
    altcoinIndex,
    fearGreedValue: fg.value,
    fearGreedLabel: fg.label,
  };
}
