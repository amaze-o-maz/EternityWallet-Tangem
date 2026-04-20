import { SHIB_CONTRACT } from './burns';

const ETH_BLOCKSCOUT = 'https://eth.blockscout.com/api';

export const EXCHANGE_WALLETS: Record<string, string> = {
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance',
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance',
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance',
  '0xf977814e90da44bfa03b6295a0616a897441acec': 'Binance',
  '0x503828976d22510aad0339f30d3831e48e0eb2a9': 'Coinbase',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase',
  '0x46340b20830761efd32832a74d7169b29feb9758': 'Crypto.com',
  '0x6262998ced04146fa42253a5c0af90ca02dfd2a3': 'Crypto.com',
  '0x1887fa9edadeab7562b01cc3f4fa246ace2c3cdd': 'Robinhood',
  '0x40b38765696e3d5d8d9d834d8aad4bb6e418e489': 'Robinhood',
  '0xf16e9b0d03470827a95cdfd0cb8a8a3b46969b91': 'KuCoin',
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

export async function fetchExchangeFlows(): Promise<ExchangeFlowSummary | null> {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 86_400;

    // Fetch recent large SHIB transfers from Blockscout
    // We query the SHIB token transfers, get the most recent ones,
    // then filter to those involving known exchange wallets.
    const url =
      `${ETH_BLOCKSCOUT}?module=account&action=tokentx` +
      `&contractaddress=${SHIB_CONTRACT}` +
      `&address=${Object.keys(EXCHANGE_WALLETS)[0]}` +
      `&page=1&offset=100&sort=desc`;

    // Query a few top exchange wallets in parallel for broader coverage
    const topWallets = Object.keys(EXCHANGE_WALLETS).slice(0, 4);
    const fetches = topWallets.map(async (wallet) => {
      try {
        const u =
          `${ETH_BLOCKSCOUT}?module=account&action=tokentx` +
          `&contractaddress=${SHIB_CONTRACT}` +
          `&address=${wallet}&page=1&offset=50&sort=desc`;
        const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
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
      if (amount < 100_000_000) continue; // Only track moves > 100M SHIB

      const fromExchange = isExchange(tx.from);
      const toExchange = isExchange(tx.to);

      if (toExchange && !fromExchange) {
        // Inflow: someone deposits to exchange
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
        // Outflow: exchange sends out
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
