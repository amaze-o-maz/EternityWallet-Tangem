// ENS (Ethereum Name Service) reverse resolution.
// Used to show human-readable names in the burn leaderboard and elsewhere.

import { createPublicClient, http, fallback } from 'viem';
import { mainnet } from 'viem/chains';
import { getNetworkByChainId } from './chains';

// Cache structure ────────────────────────────────────────────────────
// We cache both positive hits (address → name) and negative hits
// (address → null) so we don't re-query addresses with no ENS set.
// Persisted to localStorage so navigating away and returning doesn't
// re-hit the RPC for the same addresses.

const CACHE_KEY = 'shibwallet_ens_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedEntry {
  name: string | null;
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

// Public client ─────────────────────────────────────────────────────
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

/**
 * Reverse-resolve an Ethereum address to its primary ENS name.
 * Returns null if no name is set (or on error).
 * Results are cached for 24h in localStorage.
 */
export async function reverseResolveEns(address: string): Promise<string | null> {
  if (!address || !address.startsWith('0x') || address.length !== 42) return null;
  loadCache();
  const key = address.toLowerCase();

  const cached = cache[key];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.name;
  }

  try {
    const client = getEnsClient();
    const name = await client.getEnsName({ address: address as `0x${string}` });
    cache[key] = { name: name ?? null, at: Date.now() };
    saveCacheDebounced();
    return name ?? null;
  } catch {
    // Don't cache failures — next time might succeed.
    return null;
  }
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
