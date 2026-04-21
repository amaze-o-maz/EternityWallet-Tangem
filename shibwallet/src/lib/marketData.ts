const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const OKX_API = 'https://www.okx.com/api/v5';
const BYBIT_API = 'https://api.bybit.com/v5';

const BINANCE_SYMBOL = '1000SHIBUSDT'; // 1 contract = 1000 SHIB
const OKX_INSTID = 'SHIB-USDT-SWAP';
const BYBIT_SYMBOL = 'SHIBUSDT';

export interface FundingData {
  rate: number;
  label: 'Long heavy' | 'Neutral' | 'Short heavy';
  timestamp: number;
}

export type ExchangeName = 'Binance' | 'OKX' | 'Bybit';

export interface ExchangeOI {
  exchange: ExchangeName;
  oi: number; // in base SHIB units
}

export interface OpenInterestData {
  oi: number; // aggregated total in base SHIB units
  perExchange: ExchangeOI[];
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
  >(`${BINANCE_FUTURES}/fundingRate?symbol=${BINANCE_SYMBOL}&limit=1`);
  if (!data?.length) return null;
  const rate = parseFloat(data[0].fundingRate);
  return { rate, label: fundingLabel(rate), timestamp: data[0].fundingTime };
}

/* ── Per-exchange OI fetchers (all normalized to base SHIB units) ─────── */

async function fetchBinanceOI(): Promise<ExchangeOI | null> {
  const data = await fetchJson<{ openInterest: string }>(
    `${BINANCE_FUTURES}/openInterest?symbol=${BINANCE_SYMBOL}`,
  );
  if (!data?.openInterest) return null;
  // Binance 1000SHIBUSDT: 1 contract = 1000 SHIB
  const oi = parseFloat(data.openInterest) * 1000;
  return Number.isFinite(oi) && oi > 0 ? { exchange: 'Binance', oi } : null;
}

async function fetchOKXOI(): Promise<ExchangeOI | null> {
  const data = await fetchJson<{
    code: string;
    data: { oi: string; oiCcy: string }[];
  }>(`${OKX_API}/public/open-interest?instType=SWAP&instId=${OKX_INSTID}`);
  const entry = data?.data?.[0];
  if (!entry?.oiCcy) return null;
  // OKX `oiCcy` is open interest in the underlying currency (SHIB)
  const oi = parseFloat(entry.oiCcy);
  return Number.isFinite(oi) && oi > 0 ? { exchange: 'OKX', oi } : null;
}

async function fetchBybitOI(): Promise<ExchangeOI | null> {
  const data = await fetchJson<{
    retCode: number;
    result: { list: { openInterest: string }[] };
  }>(
    `${BYBIT_API}/market/open-interest?category=linear&symbol=${BYBIT_SYMBOL}&intervalTime=5min&limit=1`,
  );
  const entry = data?.result?.list?.[0];
  if (!entry?.openInterest) return null;
  // Bybit linear perps: openInterest denominated in base coin (SHIB)
  const oi = parseFloat(entry.openInterest);
  return Number.isFinite(oi) && oi > 0 ? { exchange: 'Bybit', oi } : null;
}

export async function fetchOpenInterest(): Promise<OpenInterestData | null> {
  const results = await Promise.all([
    fetchBinanceOI(),
    fetchOKXOI(),
    fetchBybitOI(),
  ]);
  const perExchange = results.filter((r): r is ExchangeOI => r !== null);
  if (perExchange.length === 0) return null;
  perExchange.sort((a, b) => b.oi - a.oi);
  const oi = perExchange.reduce((sum, e) => sum + e.oi, 0);
  return { oi, perExchange };
}

export async function fetchTicker(): Promise<TickerData | null> {
  const data = await fetchJson<{
    lastPrice: string;
    priceChange: string;
    priceChangePercent: string;
    volume: string;
    highPrice: string;
    lowPrice: string;
  }>(`${BINANCE_FUTURES}/ticker/24hr?symbol=${BINANCE_SYMBOL}`);
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
