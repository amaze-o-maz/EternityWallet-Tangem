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
  holders: number;
  totalSupply: string;
}

const ETH_TOKENS: Record<string, `0x${string}`> = {
  SHIB: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  BONE: '0x9813037ee2218799597d83D4a5B6F3b6778218d9',
  LEASH: '0x27C70Cd1946795B66be9d954418546998b546634',
  TREAT: '0xfbD5fD3f85e9f4c5e8B086efA34e45904aae49bc',
};

const SHIB_TOKENS: Record<string, `0x${string}`> = {
  TREAT: '0x985e148Ba5B9e09246Be0B110cFb3681E95bf579',
};

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
    avgBlockTime: data.average_block_time ?? 0,
  };
}

async function fetchHolders(
  baseUrl: string,
  symbol: string,
  address: string,
  chain: 'ethereum' | 'shibarium',
): Promise<TokenHolderInfo | null> {
  const data = await fetchJson<{
    holders: string;
    total_supply: string;
  }>(`${baseUrl}/tokens/${address}`);
  if (!data) return null;
  return {
    symbol,
    chain,
    holders: parseInt(data.holders, 10) || 0,
    totalSupply: data.total_supply ?? '0',
  };
}

export async function fetchTokenHolders(): Promise<TokenHolderInfo[]> {
  const tasks: Promise<TokenHolderInfo | null>[] = [];

  for (const [symbol, addr] of Object.entries(ETH_TOKENS)) {
    tasks.push(fetchHolders(ETH_BLOCKSCOUT, symbol, addr, 'ethereum'));
  }
  for (const [symbol, addr] of Object.entries(SHIB_TOKENS)) {
    tasks.push(fetchHolders(SHIBARIUM_API, symbol, addr, 'shibarium'));
  }

  const results = await Promise.all(tasks);
  return results.filter((r): r is TokenHolderInfo => r !== null);
}
