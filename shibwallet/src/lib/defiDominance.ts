/**
 * DeFi Dominance — measures SHIB's share of on-chain DEX volume against the
 * other top ETH-native memecoins. Uses the public DexScreener API.
 *
 * "Top Dog" if SHIB owns the memecoin DeFi crown. 🐕
 */

const DEXSCREENER = 'https://api.dexscreener.com/latest/dex/tokens';

interface MemeToken {
  symbol: string;
  address: string;
}

const MEME_TOKENS: MemeToken[] = [
  { symbol: 'SHIB',  address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE' },
  { symbol: 'PEPE',  address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933' },
  { symbol: 'FLOKI', address: '0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E' },
  { symbol: 'MOG',   address: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a' },
  { symbol: 'BONK',  address: '0x1151CB3d861920e07a38e03eEAd12C32178567F6' }, // ETH-bridged
];

export interface DominanceBreakdown {
  symbol: string;
  volume24h: number; // USD
  liquidity: number; // USD
}

export type DominanceLabel = 'Top Dog' | 'Alpha' | 'Pack' | 'Chasing';

export interface DefiDominance {
  dominancePct: number; // 0-100
  shibVolume: number;
  totalVolume: number;
  rank: number;
  totalCompared: number;
  label: DominanceLabel;
  breakdown: DominanceBreakdown[];
}

interface DexScreenerPair {
  chainId: string;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

async function fetchMemeStats(token: MemeToken): Promise<DominanceBreakdown | null> {
  try {
    const res = await fetch(`${DEXSCREENER}/${token.address}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DexScreenerResponse;
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    // Restrict to Ethereum pairs for an apples-to-apples comparison.
    const ethPairs = pairs.filter((p) => p.chainId === 'ethereum');
    let volume24h = 0;
    let liquidity = 0;
    for (const p of ethPairs) {
      if (p.volume?.h24) volume24h += p.volume.h24;
      if (p.liquidity?.usd) liquidity += p.liquidity.usd;
    }
    return { symbol: token.symbol, volume24h, liquidity };
  } catch {
    return null;
  }
}

function classify(pct: number): DominanceLabel {
  if (pct >= 40) return 'Top Dog';
  if (pct >= 25) return 'Alpha';
  if (pct >= 15) return 'Pack';
  return 'Chasing';
}

export async function fetchDefiDominance(): Promise<DefiDominance | null> {
  const results = await Promise.all(MEME_TOKENS.map(fetchMemeStats));
  const valid = results.filter((r): r is DominanceBreakdown => r !== null);
  if (valid.length === 0) return null;

  const shib = valid.find((r) => r.symbol === 'SHIB');
  if (!shib) return null;

  const totalVolume = valid.reduce((sum, r) => sum + r.volume24h, 0);
  const dominancePct = totalVolume > 0 ? (shib.volume24h / totalVolume) * 100 : 0;

  const sortedByVol = [...valid].sort((a, b) => b.volume24h - a.volume24h);
  const rank = sortedByVol.findIndex((r) => r.symbol === 'SHIB') + 1;

  return {
    dominancePct,
    shibVolume: shib.volume24h,
    totalVolume,
    rank,
    totalCompared: valid.length,
    label: classify(dominancePct),
    breakdown: sortedByVol,
  };
}
