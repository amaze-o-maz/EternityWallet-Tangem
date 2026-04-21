import { SHIB_CONTRACT } from './burns';

const ETH_BLOCKSCOUT = 'https://eth.blockscout.com/api';

export const EXCHANGE_WALLETS: Record<string, string> = {
  // Binance
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance',
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance',
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance',
  '0xf977814e90da44bfa03b6295a0616a897441acec': 'Binance',
  // Coinbase
  '0x503828976d22510aad0339f30d3831e48e0eb2a9': 'Coinbase',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase',
  // Crypto.com
  '0x46340b20830761efd32832a74d7169b29feb9758': 'Crypto.com',
  '0x6262998ced04146fa42253a5c0af90ca02dfd2a3': 'Crypto.com',
  // Robinhood
  '0x1887fa9edadeab7562b01cc3f4fa246ace2c3cdd': 'Robinhood',
  '0x40b38765696e3d5d8d9d834d8aad4bb6e418e489': 'Robinhood',
  // KuCoin
  '0xf16e9b0d03470827a95cdfd0cb8a8a3b46969b91': 'KuCoin',
  '0xd6216fc19db775df9774a6e33526131da7d19a2c': 'KuCoin',
  // OKX
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': 'OKX',
  '0x236f9f97e0e62388479bf9e5ba4889e46b0273c3': 'OKX',
  // Bybit
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': 'Bybit',
  '0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4': 'Bybit',
  // Gate.io
  '0x0d0707963952f2fba59dd06f2b425ace40b492fe': 'Gate.io',
  '0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c': 'Gate.io',
  // HTX (Huobi)
  '0xab5c66752a9e8167967685f1450532fb96d5d24f': 'HTX',
  '0x46705dfff24256421a05d056c29e81bdc09723b8': 'HTX',
  // Upbit
  '0x7a16ff8270133f063aab6c9977183d9e72835428': 'Upbit',
  // Gemini
  '0xd24400ae8bfebb18ca49be86258a3c749cf46853': 'Gemini',
  // Kraken
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': 'Kraken',
  '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0': 'Kraken',
  // Bitfinex
  '0x876eabf441b2ee5b5b0554fd502a8e0600950cfa': 'Bitfinex',
  // Stake.com
  '0x974caa59e49682cda0ad2bbe82983419a2ecc400': 'Stake.com',
};

export interface FlowTransaction {
  hash: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  direction: 'inflow' | 'outflow';
  exchangeName: string;
}

export interface ExchangeFlowSummary {
  inflow24h: number;
  outflow24h: number;
  netLabel: 'Net inflow' | 'Net outflow' | 'Balanced';
  recentMoves: FlowTransaction[];
}

function isExchange(addr: string): string | null {
  return EXCHANGE_WALLETS[addr.toLowerCase()] ?? null;
}

// Pick one representative wallet per exchange for querying
function pickOnePerExchange(): string[] {
  const seen = new Set<string>();
  const picks: string[] = [];
  for (const [addr, name] of Object.entries(EXCHANGE_WALLETS)) {
    if (!seen.has(name)) {
      seen.add(name);
      picks.push(addr);
    }
  }
  return picks;
}

export async function fetchExchangeFlows(): Promise<ExchangeFlowSummary | null> {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 86_400;

    const walletsToQuery = pickOnePerExchange();
    const fetches = walletsToQuery.map(async (wallet) => {
      try {
        const u =
          `${ETH_BLOCKSCOUT}?module=account&action=tokentx` +
          `&contractaddress=${SHIB_CONTRACT}` +
          `&address=${wallet}&page=1&offset=50&sort=desc`;
        const res = await fetch(u, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) return [];
        const data = await res.json();
        if (data.status !== '1' || !Array.isArray(data.result)) return [];
        return data.result as {
          hash: string;
          from: string;
          to: string;
          value: string;
          timeStamp: string;
        }[];
      } catch {
        return [];
      }
    });

    const results = await Promise.all(fetches);
    const allTxs = results.flat();

    // Deduplicate by hash
    const seen = new Set<string>();
    const unique = allTxs.filter((tx) => {
      if (seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    });

    let inflow = 0;
    let outflow = 0;
    const moves: FlowTransaction[] = [];

    for (const tx of unique) {
      const ts = parseInt(tx.timeStamp, 10);
      if (ts < cutoff) continue;

      const amount = parseFloat(tx.value) / 1e18;
      if (amount < 100_000_000) continue;

      const fromExchange = isExchange(tx.from);
      const toExchange = isExchange(tx.to);

      if (toExchange && !fromExchange) {
        inflow += amount;
        moves.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          amount,
          timestamp: ts,
          direction: 'inflow',
          exchangeName: toExchange,
        });
      } else if (fromExchange && !toExchange) {
        outflow += amount;
        moves.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          amount,
          timestamp: ts,
          direction: 'outflow',
          exchangeName: fromExchange,
        });
      }
    }

    moves.sort((a, b) => b.timestamp - a.timestamp);

    const net = inflow - outflow;
    const threshold = Math.max(inflow, outflow) * 0.1;
    let netLabel: ExchangeFlowSummary['netLabel'] = 'Balanced';
    if (net > threshold) netLabel = 'Net inflow';
    else if (net < -threshold) netLabel = 'Net outflow';

    return {
      inflow24h: inflow,
      outflow24h: outflow,
      netLabel,
      recentMoves: moves.slice(0, 10),
    };
  } catch {
    return null;
  }
}
