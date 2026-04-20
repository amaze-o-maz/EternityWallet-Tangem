const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const SYMBOL = '1000SHIBUSDT';

export interface FundingData {
  rate: number;
  label: 'Long heavy' | 'Neutral' | 'Short heavy';
  timestamp: number;
}

export interface OpenInterestData {
  oi: number;
  symbol: string;
}

export interface TickerData {
  price: number;
  priceChange24h: number;
  priceChangePct: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export interface MarketData {
  funding: FundingData | null;
  openInterest: OpenInterestData | null;
  ticker: TickerData | null;
}

function fundingLabel(rate: number): FundingData['label'] {
  if (rate > 0.0002) return 'Long heavy';
  if (rate < -0.0001) return 'Short heavy';
  return 'Neutral';
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchFunding(): Promise<FundingData | null> {
  const data = await fetchJson<
    { fundingRate: string; fundingTime: number }[]
  >(`${BINANCE_FUTURES}/fundingRate?symbol=${SYMBOL}&limit=1`);
  if (!data?.length) return null;
  const rate = parseFloat(data[0].fundingRate);
  return { rate, label: fundingLabel(rate), timestamp: data[0].fundingTime };
}

export async function fetchOpenInterest(): Promise<OpenInterestData | null> {
  const data = await fetchJson<{ openInterest: string; symbol: string }>(
    `${BINANCE_FUTURES}/openInterest?symbol=${SYMBOL}`,
  );
  if (!data) return null;
  return { oi: parseFloat(data.openInterest), symbol: data.symbol };
}

export async function fetchTicker(): Promise<TickerData | null> {
  const data = await fetchJson<{
    lastPrice: string;
    priceChange: string;
    priceChangePercent: string;
    volume: string;
    highPrice: string;
    lowPrice: string;
  }>(`${BINANCE_FUTURES}/ticker/24hr?symbol=${SYMBOL}`);
  if (!data) return null;
  return {
    price: parseFloat(data.lastPrice),
    priceChange24h: parseFloat(data.priceChange),
    priceChangePct: parseFloat(data.priceChangePercent),
    volume24h: parseFloat(data.volume),
    high24h: parseFloat(data.highPrice),
    low24h: parseFloat(data.lowPrice),
  };
}

export async function fetchMarketData(): Promise<MarketData> {
  const [funding, openInterest, ticker] = await Promise.all([
    fetchFunding(),
    fetchOpenInterest(),
    fetchTicker(),
  ]);
  return { funding, openInterest, ticker };
}
