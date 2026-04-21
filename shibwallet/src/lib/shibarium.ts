const SHIBARIUM_API = 'https://shibariumscan.io/api/v2';
const ETH_BLOCKSCOUT = 'https://eth.blockscout.com/api/v2';

export interface ShibariumStats {
  totalTransactions: number;
  totalBlocks: number;
  totalAddresses: number;
  avgBlockTime: number;
}

export interface TokenHolderInfo {
  symbol: string;
  chain: 'ethereum' | 'shibarium';
  holders: number | null;
  totalSupply: string;
}

interface TokenEntry {
  symbol: string;
  address: `0x${string}`;
  chain: 'ethereum' | 'shibarium';
  baseUrl: string;
}

const ALL_TOKENS: TokenEntry[] = [
  // Ethereum
  { symbol: 'SHIB',  address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', chain: 'ethereum',  baseUrl: ETH_BLOCKSCOUT },
  { symbol: 'BONE',  address: '0x9813037ee2218799597d83D4a5B6F3b6778218d9', chain: 'ethereum',  baseUrl: ETH_BLOCKSCOUT },
  { symbol: 'LEASH', address: '0x27C70Cd1946795B66be9d954418546998b546634', chain: 'ethereum',  baseUrl: ETH_BLOCKSCOUT },
  { symbol: 'TREAT', address: '0xa02C49Da76A085e4E1EE60A6b920dDbC8db599F4', chain: 'ethereum',  baseUrl: ETH_BLOCKSCOUT },
  // Shibarium
  { symbol: 'SHIB',  address: '0x495eea66b0f8b636d441dc6a98d8f5c3d455c4c0', chain: 'shibarium', baseUrl: SHIBARIUM_API },
  { symbol: 'LEASH', address: '0x65218a41fb92637254b4f8c97448d3df343a3064', chain: 'shibarium', baseUrl: SHIBARIUM_API },
  { symbol: 'TREAT', address: '0x506d8d2d9c715Eb34F514cc3EF48C7aBD19e2bc7', chain: 'shibarium', baseUrl: SHIBARIUM_API },
  { symbol: 'WBONE', address: '0xC76F4c819D820369Fb2d7C1531aB3Bb18e6fE8d8', chain: 'shibarium', baseUrl: SHIBARIUM_API },
];

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchShibariumStats(): Promise<ShibariumStats | null> {
  const data = await fetchJson<{
    total_transactions: string;
    total_blocks: string;
    total_addresses: string;
    average_block_time: number;
  }>(`${SHIBARIUM_API}/stats`);
  if (!data) return null;
  return {
    totalTransactions: parseInt(data.total_transactions, 10) || 0,
    totalBlocks: parseInt(data.total_blocks, 10) || 0,
    totalAddresses: parseInt(data.total_addresses, 10) || 0,
    avgBlockTime: (data.average_block_time ?? 0) / 1000,
  };
}

async function fetchHolders(entry: TokenEntry): Promise<TokenHolderInfo> {
  const data = await fetchJson<Record<string, unknown>>(
    `${entry.baseUrl}/tokens/${entry.address}`,
  );
  if (!data) {
    return { symbol: entry.symbol, chain: entry.chain, holders: null, totalSupply: '0' };
  }
  const raw = data.holders_count ?? data.holders ?? data.holder_count ?? null;
  const holders = raw === null ? null : (typeof raw === 'number' ? raw : parseInt(String(raw), 10) || 0);
  return {
    symbol: entry.symbol,
    chain: entry.chain,
    holders,
    totalSupply: String(data.total_supply ?? '0'),
  };
}

export async function fetchTokenHolders(): Promise<TokenHolderInfo[]> {
  const results = await Promise.all(ALL_TOKENS.map(fetchHolders));
  return results;
}
