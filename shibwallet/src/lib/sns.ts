// SNS (Shib Name Service) resolution via D3 DNS-over-HTTPS
// Uses Cloudflare DoH to resolve .shib names through the D3/vana DNS infrastructure.

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const FORWARDER_DOMAIN = 'vana';

// Network keys per chain
const CHAIN_NETWORK: Record<number, string> = {
  1: 'ETH',
  109: 'BONE',
};

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
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, val: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, val);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }
}

const forwardCache = new LRUCache<string | null>(MAX_CACHE);
const reverseCache = new LRUCache<string | null>(MAX_CACHE);

/** Fetch DNS TXT or CNAME records via Cloudflare DoH */
async function dohQuery(hostname: string, type: 'TXT' | 'CNAME'): Promise<{ data: string; ttl: number }[] | null> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`;
  const resp = await fetch(url, { headers: { accept: 'application/dns-json' } });
  const json = await resp.json() as { Status: number; Answer?: { type: number; data: string; TTL: number }[] };
  if (json.Status !== 0 || !json.Answer) return null;
  // TXT = type 16, CNAME = type 5
  const typeNum = type === 'TXT' ? 16 : 5;
  const records = json.Answer.filter((a: { type: number }) => a.type === typeNum);
  if (records.length === 0) return null;
  return records.map((a: { data: string; TTL: number }) => ({ data: a.data.replace(/"/g, ''), ttl: a.TTL }));
}

/** Returns true if input looks like a .shib name */
export function isShibName(input: string): boolean {
  return /^[a-zA-Z0-9_-]+\.shib$/i.test(input.trim());
}

/** Normalize display: ensure dot format */
export function formatShibName(name: string): string {
  return name.replace(/\*/g, '.');
}

/**
 * Resolve a .shib name to an address via DNS-over-HTTPS.
 * Queries _w3addr.{name}.vana TXT records for the target network.
 */
export async function resolveShibName(name: string, chainId: number = 109): Promise<string | null> {
  const normalized = name.trim().toLowerCase();
  const cacheKey = `${normalized}:${chainId}`;

  if (forwardCache.has(cacheKey)) {
    return forwardCache.get(cacheKey)!;
  }

  const network = CHAIN_NETWORK[chainId] || 'BONE';

  try {
    // Try _w3addr first, then _web3connect (D3 standard)
    for (const prefix of ['_w3addr', '_web3connect']) {
      const hostname = `${prefix}.${normalized}.${FORWARDER_DOMAIN}`;
      const records = await dohQuery(hostname, 'TXT');
      if (!records) continue;

      // Parse TXT records: "BONE:0x..." or "WALLET.BONE=0x..."
      for (const rec of records) {
        const txt = rec.data;
        // Format 1: BONE:0xAddress
        const colonParts = txt.split(':');
        if (colonParts.length === 2 && colonParts[0].toUpperCase() === network) {
          const addr = colonParts[1];
          forwardCache.set(cacheKey, addr);
          reverseCache.set(`${addr.toLowerCase()}:${chainId}`, normalized);
          return addr;
        }
        // Format 2: WALLET.BONE=0xAddress
        const eqParts = txt.split('=');
        if (eqParts.length === 2 && eqParts[0].toUpperCase() === `WALLET.${network}`) {
          const addr = eqParts[1];
          forwardCache.set(cacheKey, addr);
          reverseCache.set(`${addr.toLowerCase()}:${chainId}`, normalized);
          return addr;
        }
      }
    }

    forwardCache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.error('[SNS] Forward resolve failed:', err);
    return null;
  }
}

/**
 * Reverse-resolve an address to a .shib name via DNS-over-HTTPS.
 * Checks CNAME records at {addr}.{network}.wallet.vana and legacy TXT records.
 */
export async function reverseResolveShibName(address: string, chainId: number = 109): Promise<string | null> {
  const cacheKey = `${address.toLowerCase()}:${chainId}`;

  if (reverseCache.has(cacheKey)) {
    return reverseCache.get(cacheKey)!;
  }

  const network = (CHAIN_NETWORK[chainId] || 'BONE').toLowerCase();
  const addrNorm = address.toLowerCase().replace('0x', '');

  try {
    // Try CNAME: {addr}.{network}.wallet.vana
    const cnameRecords = await dohQuery(`${addrNorm}.${network}.wallet.${FORWARDER_DOMAIN}`, 'CNAME');
    if (cnameRecords && cnameRecords.length > 0) {
      // CNAME value ends with trailing dot, remove it
      const name = cnameRecords[0].data.replace(/\.$/, '');
      reverseCache.set(cacheKey, name);
      forwardCache.set(`${name.toLowerCase()}:${chainId}`, address);
      return name;
    }

    // Try legacy TXT: {addr}.web3-addr.vana
    const txtRecords = await dohQuery(`${addrNorm}.web3-addr.${FORWARDER_DOMAIN}`, 'TXT');
    if (txtRecords) {
      const networkUpper = network.toUpperCase();
      for (const rec of txtRecords) {
        const parts = rec.data.split(/[=:]/);
        if (parts.length === 2 && parts[0].toUpperCase() === networkUpper) {
          const name = parts[1];
          reverseCache.set(cacheKey, name);
          forwardCache.set(`${name.toLowerCase()}:${chainId}`, address);
          return name;
        }
      }
    }

    reverseCache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.error('[SNS] Reverse resolve failed:', err);
    reverseCache.set(cacheKey, null);
    return null;
  }
}
