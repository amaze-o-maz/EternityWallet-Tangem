import { createPublicClient, http, fallback } from 'viem';

// D3 resolver contracts on Shibarium
const FORWARD_RESOLVER = '0xD60D40674E678F0089736D6381071973a75B4B6f' as const;
const REVERSE_RESOLVER = '0x91c2d22ca1028B2E55e3097096494Eb34b7fc81c' as const;
// Use the same RPC list as chains.ts so we have proper fallback coverage
const SHIBARIUM_RPCS = [
  'https://rpc.shibarium.shib.io',
  'https://shibrpc.com',
  'https://rpc.shibrpc.com',
];
const NETWORK_PARAM = 'shibarium';

const RESOLVER_ABI = [
  {
    name: 'resolve',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'network', type: 'string' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'reverseResolve',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'network', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// LRU cache with max entries
const MAX_CACHE = 200;

class LRUCache<V> {
  private map = new Map<string, V>();
  private max: number;

  constructor(max: number) {
    this.max = max;
  }

  get(key: string): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, val: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      // Delete oldest entry
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, val);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }
}

// Caches: forward (name → address) and reverse (address → name)
const forwardCache = new LRUCache<string | null>(MAX_CACHE);
const reverseCache = new LRUCache<string | null>(MAX_CACHE);

// Lazy client - created once on first use
let _client: ReturnType<typeof createPublicClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: {
        id: 109,
        name: 'Shibarium',
        nativeCurrency: { name: 'BONE', symbol: 'BONE', decimals: 18 },
        rpcUrls: { default: { http: SHIBARIUM_RPCS } },
      },
      transport: fallback(
        SHIBARIUM_RPCS.map((url) => http(url, { timeout: 15_000 })),
        { rank: false, retryCount: 2 },
      ),
    });
  }
  return _client;
}

/** Returns true if input looks like a .shib name (e.g. "mazrael.shib" or "mazrael*shib") */
export function isShibName(input: string): boolean {
  return /^[a-zA-Z0-9_-]+[.*]shib$/i.test(input.trim());
}

/** Convert star format to dot format for display: mazrael*shib → mazrael.shib */
export function formatShibName(name: string): string {
  return name.replace(/\*/g, '.');
}

/** Convert dot format to star format for on-chain queries: mazrael.shib → mazrael*shib */
function toStarFormat(name: string): string {
  return name.replace(/\./g, '*');
}

/**
 * Resolve a .shib name to an address.
 * Accepts "mazrael.shib" or "mazrael*shib".
 * Returns the resolved address, or null if the name is not registered.
 * Throws if the RPC call itself fails (network/timeout), so callers can
 * show a "network error" message instead of a misleading "Name not found".
 */
export async function resolveShibName(name: string): Promise<string | null> {
  const normalized = toStarFormat(name.trim().toLowerCase());
  const cacheKey = normalized;

  if (forwardCache.has(cacheKey)) {
    return forwardCache.get(cacheKey)!;
  }

  // Let RPC errors propagate so the caller can distinguish them from
  // "name not registered" (zero-address response).
  const client = getClient();
  const result = await client.readContract({
    address: FORWARD_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: 'resolve',
    args: [normalized, NETWORK_PARAM],
  });

  const addr = result as string;
  if (!addr || addr === ZERO_ADDRESS) {
    forwardCache.set(cacheKey, null);
    return null;
  }

  forwardCache.set(cacheKey, addr);
  // Also populate reverse cache
  reverseCache.set(addr.toLowerCase(), formatShibName(normalized));
  return addr;
}

/**
 * Reverse-resolve an address to a .shib name.
 * Returns the name in dot format (mazrael.shib) or null.
 */
export async function reverseResolveShibName(address: string): Promise<string | null> {
  const cacheKey = address.toLowerCase();

  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey)!;
  }

  try {
    const client = getClient();
    const result = await client.readContract({
      address: REVERSE_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: 'reverseResolve',
      args: [address as `0x${string}`, NETWORK_PARAM],
    });

    const name = result as string;
    if (!name || name === '') {
      reverseCache.set(cacheKey, null);
      return null;
    }

    const displayName = formatShibName(name);
    reverseCache.set(cacheKey, displayName);
    // Also populate forward cache
    forwardCache.set(toStarFormat(name.toLowerCase()), address);
    return displayName;
  } catch (err) {
    console.error('[SNS] Reverse resolve failed:', err);
    reverseCache.set(cacheKey, null);
    return null;
  }
}
