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

interface GlobalData {
  totalMarketCap: number;
  totalVolume24h: number;
  marketCapChange24h: number;
  btcDominance: number;
}

async function fetchGlobalFromCoinPaprika(): Promise<GlobalData | null> {
  try {
    const res = await fetch('https://api.coinpaprika.com/v1/global', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      totalMarketCap: d.market_cap_usd ?? 0,
      totalVolume24h: d.volume_24h_usd ?? 0,
      marketCapChange24h: d.market_cap_change_24h ?? 0,
      btcDominance: d.bitcoin_dominance_percentage ?? 60,
    };
  } catch {
    return null;
  }
}

async function fetchGlobalFromCoinGecko(): Promise<GlobalData | null> {
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true';
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const btcCap = data.bitcoin?.usd_market_cap ?? 0;
    const ethCap = data.ethereum?.usd_market_cap ?? 0;
    if (btcCap === 0) return null;
    const btcVol = data.bitcoin?.usd_24h_vol ?? 0;
    const ethVol = data.ethereum?.usd_24h_vol ?? 0;
    const knownCap = btcCap + ethCap;
    const knownVol = btcVol + ethVol;
    const share = 0.70;
    return {
      totalMarketCap: knownCap / share,
      totalVolume24h: knownVol / share,
      marketCapChange24h: data.bitcoin?.usd_24h_change ?? 0,
      btcDominance: (btcCap / (knownCap / share)) * 100,
    };
  } catch {
    return null;
  }
}

async function fetchGlobalFromCryptoCompare(): Promise<GlobalData | null> {
  try {
    const url =
      'https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC,ETH&tsyms=USD';
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const btc = data.RAW?.BTC?.USD;
    const eth = data.RAW?.ETH?.USD;
    if (!btc || !btc.MKTCAP) return null;
    const btcCap = btc.MKTCAP ?? 0;
    const ethCap = eth?.MKTCAP ?? 0;
    const btcVol = btc.TOTALVOLUME24HTO ?? 0;
    const ethVol = eth?.TOTALVOLUME24HTO ?? 0;
    const share = 0.70;
    const knownCap = btcCap + ethCap;
    const knownVol = btcVol + ethVol;
    return {
      totalMarketCap: knownCap / share,
      totalVolume24h: knownVol / share,
      marketCapChange24h: btc.CHANGEPCT24HOUR ?? 0,
      btcDominance: (btcCap / (knownCap / share)) * 100,
    };
  } catch {
    return null;
  }
}

async function fetchGlobalData(): Promise<GlobalData | null> {
  const paprika = await fetchGlobalFromCoinPaprika();
  if (paprika && paprika.totalMarketCap > 0) return paprika;
  const gecko = await fetchGlobalFromCoinGecko();
  if (gecko && gecko.totalMarketCap > 0) return gecko;
  const cc = await fetchGlobalFromCryptoCompare();
  if (cc && cc.totalMarketCap > 0) return cc;
  return null;
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
  const [globalData, fg] = await Promise.all([
    fetchGlobalData(),
    fetchFearGreed(),
  ]);

  if (!globalData) return null;

  const altcoinIndex = Math.round(
    Math.max(0, Math.min(100, ((65 - globalData.btcDominance) / 25) * 100)),
  );

  return {
    totalMarketCap: globalData.totalMarketCap,
    totalVolume24h: globalData.totalVolume24h,
    marketCapChange24h: globalData.marketCapChange24h,
    btcDominance: globalData.btcDominance,
    altcoinIndex,
    fearGreedValue: fg.value,
    fearGreedLabel: fg.label,
  };
}
