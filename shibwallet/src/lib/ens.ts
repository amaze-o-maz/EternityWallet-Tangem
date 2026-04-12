// ENS (Ethereum Name Service) reverse resolution.
// Used to show human-readable names in the burn leaderboard and elsewhere.
//
// Uses the ensideas.com public API which resolves both the primary name
// AND the avatar in a single HTTP request (CORS-friendly, no RPC needed).
// Falls back to viem's getEnsName via our Ethereum RPCs if ensideas is
// unreachable.

import { createPublicClient, http, fallback } from 'viem';
import { mainnet } from 'viem/chains';
import { getNetworkByChainId } from './chains';

const ENSIDEAS_URL = 'https://api.ensideas.com/ens/resolve/';
const CACHE_KEY = 'shibwallet_ens_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedEntry {
  name: string | null; // null means "confirmed no name set"
  at: number;
}

let cache: Record<string, CachedEntry> = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) cache = JSON.parse(raw);
  } catch {
    cache = {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveCacheDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      /* quota exceeded — ignore */
    }
  }, 500);
}

// viem fallback client (only used if ensideas fails)
let ensClient: ReturnType<typeof createPublicClient> | null = null;
function getEnsClient() {
  if (ensClient) return ensClient;
  const network = getNetworkByChainId(1);
  const rpcs = network
    ? [network.rpcUrl, ...(network.rpcFallbacks ?? [])]
    : ['https://eth.llamarpc.com', 'https://1rpc.io/eth', 'https://cloudflare-eth.com'];
  ensClient = createPublicClient({
    chain: mainnet,
    transport:
      rpcs.length > 1
        ? fallback(rpcs.map((u) => http(u, { timeout: 8_000 })))
        : http(rpcs[0], { timeout: 8_000 }),
  });
  return ensClient;
}

async function resolveViaEnsIdeas(address: string): Promise<string | null | 'error'> {
  try {
    const res = await fetch(ENSIDEAS_URL + address.toLowerCase(), {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return 'error';
    const data = (await res.json()) as { name?: string | null; displayName?: string | null };
    // ensideas returns displayName === address when no name is set, so
    // we check .name which is null in that case.
    return data.name && data.name.length > 0 ? data.name : null;
  } catch {
    return 'error';
  }
}

async function resolveViaViem(address: string): Promise<string | null | 'error'> {
  try {
    const client = getEnsClient();
    const name = await client.getEnsName({ address: address as `0x${string}` });
    return name ?? null;
  } catch {
    return 'error';
  }
}

/**
 * Reverse-resolve an Ethereum address to its primary ENS name.
 * Returns null if no name is set (cached for 24h).
 */
export async function reverseResolveEns(address: string): Promise<string | null> {
  if (!address || !address.startsWith('0x') || address.length !== 42) return null;
  loadCache();
  const key = address.toLowerCase();

  const cached = cache[key];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.name;
  }

  // Try ensideas first (fast, single HTTP call, CORS-friendly)
  let result = await resolveViaEnsIdeas(address);

  // If ensideas errored, fall back to viem + RPC
  if (result === 'error') {
    result = await resolveViaViem(address);
  }

  // If both failed, don't cache — next attempt might succeed.
  if (result === 'error') return null;

  cache[key] = { name: result, at: Date.now() };
  saveCacheDebounced();
  return result;
}

/**
 * Batch-resolve many addresses in parallel. Returns a map of
 * lowercased address → name (or null if none set).
 */
export async function reverseResolveEnsBatch(
  addresses: string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const results = await Promise.all(
    addresses.map(async (addr) => [addr.toLowerCase(), await reverseResolveEns(addr)] as const),
  );
  for (const [k, v] of results) out[k] = v;
  return out;
}
