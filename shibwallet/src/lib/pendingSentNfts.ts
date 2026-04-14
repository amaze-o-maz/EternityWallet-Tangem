// Tracks NFTs that have just been sent so the gallery can hide them until
// the chain indexer (Blockscout) catches up. Without this, users can
// re-select a freshly-sent NFT and hit a revert (ERC721InsufficientApproval)
// because the indexer still reports them as owned for a minute or two.

const KEY = 'shibwallet_pending_sent_nfts';
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface PendingSentEntry {
  quantity: number; // cumulative copies sent within TTL (ERC-1155 can be > 1)
  at: number;
}

export type PendingSentMap = Record<string, PendingSentEntry>;

type AllBuckets = Record<string, PendingSentMap>;

function readAll(): AllBuckets {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AllBuckets) : {};
  } catch {
    return {};
  }
}

function writeAll(data: AllBuckets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota — ignore */
  }
}

function bucketKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function itemKey(contractAddress: string, tokenId: string): string {
  return `${contractAddress.toLowerCase()}:${tokenId}`;
}

/** Record one or more NFTs as pending-sent. Quantities accumulate. */
export function markNftsSent(
  chainId: number,
  address: string,
  items: Array<{ contractAddress: string; tokenId: string; quantity?: number }>,
): void {
  if (!items.length) return;
  const all = readAll();
  const bk = bucketKey(chainId, address);
  const bucket = all[bk] ?? {};
  const now = Date.now();
  for (const it of items) {
    const ik = itemKey(it.contractAddress, it.tokenId);
    const prev = bucket[ik];
    bucket[ik] = {
      quantity: (prev?.quantity ?? 0) + (it.quantity ?? 1),
      at: now,
    };
  }
  all[bk] = bucket;
  writeAll(all);
}

/** Return the pending-sent map for an address/chain, pruning expired entries. */
export function getPendingSent(
  chainId: number,
  address: string,
): PendingSentMap {
  const all = readAll();
  const bk = bucketKey(chainId, address);
  const bucket = all[bk] ?? {};
  const now = Date.now();
  const clean: PendingSentMap = {};
  let pruned = false;
  for (const [k, v] of Object.entries(bucket)) {
    if (now - v.at < TTL_MS) clean[k] = v;
    else pruned = true;
  }
  if (pruned) {
    all[bk] = clean;
    writeAll(all);
  }
  return clean;
}

/** Lookup a single pending-sent entry. */
export function getPendingSentEntry(
  pending: PendingSentMap,
  contractAddress: string,
  tokenId: string,
): PendingSentEntry | undefined {
  return pending[itemKey(contractAddress, tokenId)];
}
