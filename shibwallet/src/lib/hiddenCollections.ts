// Per-wallet list of NFT collection addresses the user has chosen to hide
// from the gallery. Kept in localStorage so it survives reloads and is
// scoped by chainId + wallet address (hides don't leak across accounts).

const KEY = 'shibwallet_hidden_nft_collections';

type AllBuckets = Record<string, string[]>;

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

export function getHiddenCollections(
  chainId: number,
  address: string,
): Set<string> {
  const all = readAll();
  const list = all[bucketKey(chainId, address)] ?? [];
  return new Set(list.map((a) => a.toLowerCase()));
}

export function hideCollection(
  chainId: number,
  address: string,
  contractAddress: string,
): void {
  const all = readAll();
  const bk = bucketKey(chainId, address);
  const list = all[bk] ?? [];
  const lower = contractAddress.toLowerCase();
  if (!list.some((a) => a.toLowerCase() === lower)) {
    list.push(lower);
    all[bk] = list;
    writeAll(all);
  }
}

export function unhideCollection(
  chainId: number,
  address: string,
  contractAddress: string,
): void {
  const all = readAll();
  const bk = bucketKey(chainId, address);
  const list = all[bk] ?? [];
  const lower = contractAddress.toLowerCase();
  const filtered = list.filter((a) => a.toLowerCase() !== lower);
  if (filtered.length !== list.length) {
    all[bk] = filtered;
    writeAll(all);
  }
}
