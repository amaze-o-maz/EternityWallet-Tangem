import { createPublicClient, http, fallback, formatUnits } from 'viem';
import { ERC20_ABI } from './abis';
import { getNetworkByChainId } from './chains';

// SHIB token contract on Ethereum
export const SHIB_CONTRACT: `0x${string}` =
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE';

// Initial total supply: 1 quadrillion SHIB
export const INITIAL_SUPPLY_FLOAT = 1_000_000_000_000_000; // 1e15

// Dead addresses where SHIB is burned
export const DEAD_ADDRESSES: `0x${string}`[] = [
  '0xdEad000000000000000000000000000000000000' as `0x${string}`, // community dead
  '0x000000000000000000000000000000000000dEaD' as `0x${string}`,
  '0xdead000000000000000042069420694206942069' as `0x${string}`, // main (Vitalik)
];

// Known burner labels
export const KNOWN_ADDRESSES: Record<string, string> = {
  '0x46340b20830761efd32832a74d7169b29feb9758': 'Crypto.com',
  '0x974caa59e49682cda0ad2bbe82983419a2ecc400': 'Stake.com',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase',
  '0x1887fa9edadeab7562b01cc3f4fa246ace2c3cdd': 'Robinhood',
  '0x28be7e8cd8125cb7a74d2002a5862e1bfd774cd9': 'ShibArmyStrong',
};

export interface BurnTransaction {
  hash: string;
  from: string;
  to: string;
  amount: string; // raw uint256 string
  timestamp: number;
}

export interface TopBurner {
  address: string;
  label?: string;
  totalBurned: number; // SHIB float
  burnCount: number;
  usdValue: number;
}

export interface TimeBucket {
  amount: number; // SHIB float
  usd: number;
  count: number;
}

export interface ChartPoint {
  time: number;
  amount: number;
}

/* ── Ethereum public client ──────────────────────────────────────────── */

function getEthClient() {
  const network = getNetworkByChainId(1);
  const rpcs = network
    ? [network.rpcUrl, ...(network.rpcFallbacks ?? [])]
    : ['https://eth.llamarpc.com', 'https://1rpc.io/eth', 'https://cloudflare-eth.com'];

  return createPublicClient({
    chain: {
      id: 1,
      name: 'Ethereum',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: rpcs } },
    } as any,
    transport:
      rpcs.length > 1
        ? fallback(rpcs.map((u) => http(u, { timeout: 10_000 })))
        : http(rpcs[0], { timeout: 10_000 }),
  });
}

/* ── On-chain: total burned ──────────────────────────────────────────── */

export async function fetchTotalBurned(): Promise<number> {
  const client = getEthClient();

  const balances = await Promise.all(
    DEAD_ADDRESSES.map((addr) =>
      client
        .readContract({
          address: SHIB_CONTRACT,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [addr],
        })
        .catch(() => 0n),
    ),
  );

  const totalRaw = balances.reduce((sum, b) => sum + (b as bigint), 0n);
  return parseFloat(formatUnits(totalRaw, 18));
}

/* ── Blockscout: recent burn transactions ────────────────────────────── */

const BLOCKSCOUT_API = 'https://eth.blockscout.com/api';

export async function fetchRecentBurns(limit = 100): Promise<BurnTransaction[]> {
  const all: BurnTransaction[] = [];

  const fetches = DEAD_ADDRESSES.map(async (deadAddr) => {
    try {
      const url =
        `${BLOCKSCOUT_API}?module=account&action=tokentx` +
        `&address=${deadAddr}` +
        `&contractaddress=${SHIB_CONTRACT}` +
        `&page=1&offset=${limit}&sort=desc`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === '1' && Array.isArray(data.result)) {
        return (data.result as any[])
          .filter((tx) => tx.to?.toLowerCase() === deadAddr.toLowerCase())
          .map((tx) => ({
            hash: tx.hash as string,
            from: tx.from as string,
            to: tx.to as string,
            amount: tx.value as string,
            timestamp: parseInt(tx.timeStamp, 10),
          }));
      }
    } catch (err) {
      console.error(`[Burns] fetch for ${deadAddr}:`, err);
    }
    return [] as BurnTransaction[];
  });

  const results = await Promise.all(fetches);
  results.forEach((txs) => all.push(...txs));

  // Deduplicate by hash, newest first
  const seen = new Set<string>();
  return all
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((tx) => {
      if (seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    });
}

/* ── Aggregation helpers ─────────────────────────────────────────────── */

export function windowedBurns(
  burns: BurnTransaction[],
  windowSec: number,
  shibPrice: number,
): TimeBucket {
  const cutoff = Math.floor(Date.now() / 1000) - windowSec;
  let amount = 0;
  let count = 0;
  for (const b of burns) {
    if (b.timestamp >= cutoff) {
      amount += parseFloat(formatUnits(BigInt(b.amount), 18));
      count++;
    }
  }
  return { amount, usd: amount * shibPrice, count };
}

export function topBurners(
  burns: BurnTransaction[],
  shibPrice: number,
  limit = 10,
): TopBurner[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const b of burns) {
    const addr = b.from.toLowerCase();
    const prev = map.get(addr) ?? { total: 0, count: 0 };
    prev.total += parseFloat(formatUnits(BigInt(b.amount), 18));
    prev.count++;
    map.set(addr, prev);
  }
  return Array.from(map.entries())
    .map(([address, d]) => ({
      address,
      label: KNOWN_ADDRESSES[address],
      totalBurned: d.total,
      burnCount: d.count,
      usdValue: d.total * shibPrice,
    }))
    .sort((a, b) => b.totalBurned - a.totalBurned)
    .slice(0, limit);
}

export function chartData(
  burns: BurnTransaction[],
  bucketSec: number,
  windowSec: number,
): ChartPoint[] {
  const now = Math.floor(Date.now() / 1000);
  const start = now - windowSec;
  const buckets = new Map<number, number>();

  // initialise empty buckets
  for (let t = start; t <= now; t += bucketSec) {
    buckets.set(t, 0);
  }

  for (const b of burns) {
    if (b.timestamp < start) continue;
    const key =
      start + Math.floor((b.timestamp - start) / bucketSec) * bucketSec;
    buckets.set(key, (buckets.get(key) ?? 0) + parseFloat(formatUnits(BigInt(b.amount), 18)));
  }

  return Array.from(buckets.entries())
    .map(([time, amount]) => ({ time, amount }))
    .sort((a, b) => a.time - b.time);
}

/* ── Formatters ──────────────────────────────────────────────────────── */

export function fmtCompact(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

export function fmtCommas(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}
