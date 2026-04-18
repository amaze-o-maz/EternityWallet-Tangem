import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPublicClient, http, fallback } from 'viem';
import { Copy, Send, Minus, Plus, X, Layers } from 'lucide-react';
import { getNetworkByChainId } from '../lib/chains';
import { useNftSelectionStore, type SelectedNFT } from '../store/nftSelectionStore';
import { getPendingSent, getPendingSentEntry, type PendingSentMap } from '../lib/pendingSentNfts';
import { getHiddenCollections, hideCollection, unhideCollection } from '../lib/hiddenCollections';
import toast from 'react-hot-toast';

interface NFTItem {
  contractAddress: string;
  tokenId: string;
  contractName: string;
  tokenStandard: string;
  imageUrl: string | null;
  balance: number; // copies owned (ERC-1155 can be >1)
}

interface NFTGalleryProps {
  address: string;
  chainId: number;
}

const IPFS_GATEWAY = 'https://cloudflare-ipfs.com/ipfs/';

function resolveUri(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return IPFS_GATEWAY + uri.slice(7);
  }
  if (uri.startsWith('ar://')) {
    return 'https://arweave.net/' + uri.slice(5);
  }
  return uri;
}

// ── localStorage cache so the NFT tab is instant on re-open ─────────
const NFT_CACHE_KEY = 'shibwallet_nft_cache';
const NFT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — revalidate in background

interface NFTCacheEntry {
  items: NFTItem[];
  at: number;
}

function nftCacheRead(address: string, chainId: number): NFTCacheEntry | null {
  try {
    const raw = localStorage.getItem(NFT_CACHE_KEY);
    if (!raw) return null;
    const all: Record<string, NFTCacheEntry> = JSON.parse(raw);
    const key = `${chainId}:${address.toLowerCase()}`;
    return all[key] ?? null;
  } catch {
    return null;
  }
}

/**
 * Filter an NFT list against the pending-sent map, subtracting quantities
 * just sent so they don't reappear while the indexer catches up.
 * - ERC-721: hide entirely if any pending entry exists for that tokenId.
 * - ERC-1155: reduce `balance` by the pending quantity; hide if ≤ 0.
 */
function filterPendingSent(items: NFTItem[], pending: PendingSentMap): NFTItem[] {
  if (!items.length || Object.keys(pending).length === 0) return items;
  const out: NFTItem[] = [];
  for (const item of items) {
    const entry = getPendingSentEntry(pending, item.contractAddress, item.tokenId);
    if (!entry) {
      out.push(item);
      continue;
    }
    if (item.tokenStandard === 'ERC-1155') {
      const newBalance = item.balance - entry.quantity;
      if (newBalance > 0) out.push({ ...item, balance: newBalance });
    }
    // ERC-721 (or anything non-1155): drop entirely
  }
  return out;
}

function nftCacheWrite(address: string, chainId: number, items: NFTItem[]) {
  try {
    const raw = localStorage.getItem(NFT_CACHE_KEY);
    const all: Record<string, NFTCacheEntry> = raw ? JSON.parse(raw) : {};
    const key = `${chainId}:${address.toLowerCase()}`;
    all[key] = { items, at: Date.now() };
    localStorage.setItem(NFT_CACHE_KEY, JSON.stringify(all));
  } catch {
    /* quota — ignore */
  }
}

const TOKEN_URI_ABI = [
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'uri',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

// Skeleton card for loading state
const SkeletonCard: React.FC<{ index: number }> = ({ index }) => (
  <div
    className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden"
    style={{ animation: `slide-up-fade 0.4s ease-out ${index * 80}ms both` }}
  >
    <div className="aspect-square bg-white/[0.04] animate-shimmer" />
    <div className="p-3 space-y-2">
      <div className="h-3.5 w-3/4 rounded bg-white/[0.06] animate-shimmer" />
      <div className="h-3 w-1/2 rounded bg-white/[0.04] animate-shimmer" />
    </div>
  </div>
);

// Colored placeholder with collection initials
const NFTPlaceholder: React.FC<{ name: string; contractAddress: string }> = ({ name, contractAddress }) => {
  // Generate a deterministic color from contract address
  const hash = contractAddress.slice(2, 8);
  const hue = parseInt(hash, 16) % 360;
  const initials = name
    ? name
        .split(/[\s-_]+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('')
    : '??';

  return (
    <div
      className="aspect-square flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 60%, 20%) 0%, hsl(${(hue + 40) % 360}, 50%, 12%) 100%)`,
      }}
    >
      <span className="text-2xl font-bold text-white/40">{initials}</span>
    </div>
  );
};

const LONG_PRESS_MS = 400;

/** Truncate a token ID or long hex value for display. */
function truncateMiddle(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

async function copyText(text: string, label: string) {
  try {
    // Prefer the Clipboard API when available (HTTPS / modern WebView).
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older WebViews
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast.success(`${label} copied`);
  } catch {
    toast.error('Copy failed');
  }
}

interface NFTActionMenuProps {
  nft: NFTItem;
  onClose: () => void;
  onSendNow: (quantity: number) => void;
  onAddToSelection: (quantity: number) => void;
}

const NFTActionMenu: React.FC<NFTActionMenuProps> = ({
  nft,
  onClose,
  onSendNow,
  onAddToSelection,
}) => {
  const isErc1155 = nft.tokenStandard === 'ERC-1155';
  const maxQty = isErc1155 ? Math.max(nft.balance, 1) : 1;
  const [qty, setQty] = useState(1);
  const [qtyInput, setQtyInput] = useState('1');

  useEffect(() => {
    setQtyInput(String(qty));
  }, [qty]);

  const clampQty = (n: number) => Math.max(1, Math.min(maxQty, Math.floor(n) || 1));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-[#111] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl animate-slide-up-fade"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — NFT preview */}
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
          <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-white/[0.08]">
            {nft.imageUrl ? (
              <img src={nft.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <NFTPlaceholder name={nft.contractName} contractAddress={nft.contractAddress} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {nft.contractName || 'Unknown Collection'}
            </p>
            <p className="text-[11px] text-gray-500 font-mono truncate">
              #{truncateMiddle(nft.tokenId, 8, 6)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ERC-1155 quantity picker */}
        {isErc1155 && maxQty > 1 && (
          <div className="p-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                Quantity
              </span>
              <span className="text-[11px] text-gray-500">
                Balance: <span className="text-gray-300 font-medium">{maxQty}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1.5">
              <button
                onClick={() => setQty(clampQty(qty - 1))}
                disabled={qty <= 1}
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Decrease quantity"
              >
                <Minus size={16} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={qtyInput}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d]/g, '');
                  setQtyInput(cleaned);
                }}
                onBlur={() => {
                  const n = parseInt(qtyInput, 10);
                  setQty(clampQty(isNaN(n) ? 1 : n));
                }}
                className="flex-1 bg-transparent text-center text-white text-base font-semibold tabular-nums focus:outline-none"
              />
              <button
                onClick={() => setQty(clampQty(qty + 1))}
                disabled={qty >= maxQty}
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Increase quantity"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setQty(maxQty)}
                disabled={qty >= maxQty}
                className="px-2.5 h-9 rounded-lg text-[10px] font-bold text-white
                           bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                           disabled:opacity-30 disabled:cursor-not-allowed
                           transition-all active:scale-95"
                aria-label="Select all"
              >
                MAX
              </button>
            </div>
          </div>
        )}

        {/* Action rows */}
        <div className="p-2">
          <button
            onClick={() => copyText(nft.tokenId, 'Token ID')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-white/[0.04] transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              <Copy size={16} className="text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">Copy Token ID</p>
              <p className="text-[11px] text-gray-500 font-mono truncate">
                {truncateMiddle(nft.tokenId, 10, 6)}
              </p>
            </div>
          </button>

          <button
            onClick={() => copyText(nft.contractAddress, 'Contract address')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-white/[0.04] transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              <Copy size={16} className="text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">Copy Contract Address</p>
              <p className="text-[11px] text-gray-500 font-mono truncate">
                {truncateMiddle(nft.contractAddress, 10, 6)}
              </p>
            </div>
          </button>

          <button
            onClick={() => onAddToSelection(qty)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-white/[0.04] transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
              <Layers size={16} className="text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">Add to Selection</p>
              <p className="text-[11px] text-gray-500">
                Batch-send multiple NFTs together
              </p>
            </div>
          </button>
        </div>

        {/* Send button */}
        <div className="p-4 pt-2 border-t border-white/[0.06]">
          <button
            onClick={() => onSendNow(qty)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                       text-white font-semibold text-sm transition-all duration-300 active:scale-[0.97]
                       hover:shadow-[0_0_20px_rgba(255,105,0,0.3)]
                       flex items-center justify-center gap-2"
          >
            <Send size={16} />
            Send{isErc1155 && maxQty > 1 && qty > 1 ? ` ${qty}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

const NFTCard: React.FC<{
  nft: NFTItem;
  selectionMode?: boolean;
  isSelected?: boolean;
  selectedQty?: number;
  onLongPress?: () => void;
  onTap?: () => void;
}> = ({ nft, selectionMode, isSelected, selectedQty, onLongPress, onTap }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const truncatedId =
    nft.tokenId.length > 8 ? nft.tokenId.slice(0, 4) + '...' + nft.tokenId.slice(-4) : nft.tokenId;

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const onPointerDown = () => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress?.();
    }, LONG_PRESS_MS);
  };
  const onPointerUp = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!didLongPress.current && selectionMode) {
      onTap?.();
    }
  };
  const onPointerLeave = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  return (
    <div
      className={`bg-white/[0.03] backdrop-blur-xl border rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg group select-none
        ${isSelected ? 'border-[#FF6900] ring-2 ring-[#FF6900]/40' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative">
        {nft.imageUrl && !imgError ? (
          <>
            {imgLoading && (
              <div className="aspect-square bg-white/[0.04] animate-shimmer absolute inset-0" />
            )}
            <img
              src={nft.imageUrl}
              alt={`${nft.contractName} #${nft.tokenId}`}
              loading="lazy"
              decoding="async"
              className={`aspect-square w-full object-cover transition-opacity duration-300 ${
                imgLoading ? 'opacity-0' : 'opacity-100'
              }`}
              onLoad={() => setImgLoading(false)}
              onError={() => {
                setImgError(true);
                setImgLoading(false);
              }}
            />
          </>
        ) : (
          <NFTPlaceholder name={nft.contractName} contractAddress={nft.contractAddress} />
        )}
        {/* Selection checkmark */}
        {selectionMode && (
          <div className="absolute top-2 left-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all
                ${isSelected
                  ? 'bg-[#FF6900] border-[#FF6900]'
                  : 'bg-black/40 border-white/30 backdrop-blur-sm'}`}
            >
              {isSelected && (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8.5L7 11.5l5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
        )}
        {/* Token standard badge */}
        <div className="absolute top-2 right-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/60 backdrop-blur-sm text-gray-300 border border-white/[0.08]">
            {nft.tokenStandard}
          </span>
        </div>
        {/* ERC-1155 balance badge (bottom-right) */}
        {nft.balance > 1 && (
          <div className="absolute bottom-2 right-2">
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-black/70 backdrop-blur-sm text-white border border-white/[0.12]">
              ×{nft.balance}
            </span>
          </div>
        )}
        {/* Selected quantity overlay (bottom-left) */}
        {isSelected && selectedQty !== undefined && selectedQty > 0 && nft.balance > 1 && (
          <div className="absolute bottom-2 left-2">
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#FF6900] text-white">
              {selectedQty}/{nft.balance}
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-white truncate">{nft.contractName || 'Unknown Collection'}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 font-mono">#{truncatedId}</p>
      </div>
    </div>
  );
};

const NFTGallery: React.FC<NFTGalleryProps> = ({ address, chainId }) => {
  const navigate = useNavigate();
  const { selected, toggle, clearSelection, isSelected, getQuantity, replaceWithSingle } =
    useNftSelectionStore();
  const selectionMode = selected.length > 0;

  // The NFT currently showing its action menu (long-pressed). Null = closed.
  const [actionMenuNft, setActionMenuNft] = useState<NFTItem | null>(null);

  // Hydrate from cache synchronously so re-opening the tab shows the last
  // seen collections instantly instead of flashing a skeleton for 5-10s.
  const initialCache = useMemo(
    () => nftCacheRead(address, chainId),
    // Only read once per mount; re-reading on every render would defeat
    // the purpose of hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [nfts, setNfts] = useState<NFTItem[]>(
    filterPendingSent(initialCache?.items ?? [], getPendingSent(chainId, address)),
  );
  // Only show the skeleton when we have nothing to display yet.
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAtRef = useRef<number>(initialCache?.at ?? 0);

  // Per-wallet set of hidden collection addresses (lowercased).
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(
    () => getHiddenCollections(chainId, address),
  );
  const [showHidden, setShowHidden] = useState(false);

  // Refresh hidden set when wallet / chain changes.
  useEffect(() => {
    setHiddenSet(getHiddenCollections(chainId, address));
    setShowHidden(false);
  }, [address, chainId]);

  const handleHideCollection = useCallback(
    (contractAddress: string, name: string) => {
      hideCollection(chainId, address, contractAddress);
      setHiddenSet(getHiddenCollections(chainId, address));
      toast.success(`Hid "${name}"`, { duration: 2000 });
    },
    [chainId, address],
  );

  const handleUnhideCollection = useCallback(
    (contractAddress: string, name: string) => {
      unhideCollection(chainId, address, contractAddress);
      setHiddenSet(getHiddenCollections(chainId, address));
      toast.success(`Restored "${name}"`, { duration: 2000 });
    },
    [chainId, address],
  );

  // Clear selection when wallet address or chain changes — but NOT on
  // unmount, because navigating to /wallet/send-nft unmounts this
  // component and we need the selection to survive.
  const prevAddrRef = useRef(address);
  const prevChainRef = useRef(chainId);
  useEffect(() => {
    if (prevAddrRef.current !== address || prevChainRef.current !== chainId) {
      clearSelection();
      prevAddrRef.current = address;
      prevChainRef.current = chainId;
    }
  }, [address, chainId, clearSelection]);

  const fetchNFTs = useCallback(async (opts: { silent?: boolean; force?: boolean } = {}) => {
    // Only show the skeleton if we don't have cached data to display.
    if (!opts.silent) setLoading(true);
    setError(null);

    const network = getNetworkByChainId(chainId);
    if (!network) {
      setError('Network not supported');
      setLoading(false);
      return;
    }

    // Fetch with retry on 5xx / network errors (exponential backoff).
    const fetchWithRetry = async (url: string, attempts = 3): Promise<Response> => {
      let lastErr: unknown = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
          // Retry on 5xx (server error / temporary outage)
          if (res.status >= 500 && res.status < 600 && i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 800 * (i + 1)));
            continue;
          }
          return res;
        } catch (err) {
          lastErr = err;
          if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 800 * (i + 1)));
          }
        }
      }
      throw lastErr ?? new Error('Fetch failed');
    };

    try {
      let items: NFTItem[] = [];

      // Use Blockscout v2 /nft endpoint for all chains
      // Shibarium uses shibariumscan.io, Ethereum uses eth.blockscout.com
      const blockscoutBase =
        chainId === 109
          ? 'https://shibariumscan.io'
          : chainId === 1
            ? 'https://eth.blockscout.com'
            : null;

      if (blockscoutBase) {
        const url = `${blockscoutBase}/api/v2/addresses/${address}/nft`;
        const res = await fetchWithRetry(url);
        if (!res.ok) {
          if (res.status >= 500) {
            throw new Error(
              `${chainId === 109 ? 'Shibarium' : 'Ethereum'} explorer is temporarily unavailable (HTTP ${res.status}). Please try again in a moment.`,
            );
          }
          throw new Error(`Explorer returned HTTP ${res.status}`);
        }
        const data = await res.json();

        if (data.items && Array.isArray(data.items)) {
          let allItems = [...data.items];
          let nextParams = data.next_page_params;

          // Walk every page the explorer offers so collections that live
          // past the first few pages aren't silently dropped. Hard cap at
          // 100 pages (~30k NFTs with 50/page, ~5k+ entries in practice)
          // as a safety net — whales with many ERC-1155 collections can
          // easily exceed the old 20-page cap.
          let page = 0;
          while (nextParams && page < 100) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(nextParams)) {
              params.set(k, String(v));
            }
            const nextUrl = `${blockscoutBase}/api/v2/addresses/${address}/nft?${params.toString()}`;
            try {
              const nextRes = await fetch(nextUrl);
              if (!nextRes.ok) break;
              const nextData = await nextRes.json();
              if (nextData.items && Array.isArray(nextData.items)) {
                allItems.push(...nextData.items);
              }
              nextParams = nextData.next_page_params;
            } catch {
              break;
            }
            page++;
          }

          items = allItems.map((item: any) => {
            let imageUrl: string | null = null;
            if (item.image_url) {
              imageUrl = resolveUri(item.image_url);
            } else if (item.metadata?.image) {
              imageUrl = resolveUri(item.metadata.image);
            }
            const standard = item.token_type ?? (item.token?.type === 'ERC-1155' ? 'ERC-1155' : 'ERC-721');
            return {
              contractAddress: item.token?.address_hash ?? item.token?.address ?? '',
              tokenId: item.id ?? '0',
              contractName: item.token?.name ?? 'Unknown',
              tokenStandard: standard,
              imageUrl,
              balance: standard === 'ERC-1155' ? parseInt(item.value ?? '1', 10) || 1 : 1,
            };
          });
        }
      } else {
        // Unsupported chain for NFTs
        items = [];
      }

      // ── Defensive merge ──────────────────────────────────────────
      // If the API returned fewer items than we already have cached,
      // the response is likely incomplete (rate-limit, pagination
      // failure, flaky indexer).  Merge: keep cached collections that
      // the API didn't mention at all so we never silently drop an
      // entire collection.  A forced refresh (pull-to-refresh) skips
      // this protection so the user can clear truly stale data.
      const cached = nftCacheRead(address, chainId)?.items ?? [];
      if (!opts.force && cached.length > 0 && items.length > 0) {
        // Build a set of collection addresses the API returned
        const fetchedCollections = new Set(
          items.map((n) => n.contractAddress.toLowerCase()),
        );
        // Find cached items whose entire collection is missing from
        // the API response — those are likely dropped, not sold.
        const rescued: NFTItem[] = [];
        for (const c of cached) {
          if (!fetchedCollections.has(c.contractAddress.toLowerCase())) {
            rescued.push(c);
          }
        }
        if (rescued.length > 0) {
          // Merge: API items first, then rescued cached items
          items = [...items, ...rescued];
        }
      }

      // Hide NFTs the user just sent but the indexer hasn't dropped yet.
      const visibleItems = filterPendingSent(items, getPendingSent(chainId, address));
      setNfts(visibleItems);
      // Cache the filtered view so a re-open doesn't briefly show the sent NFT
      // again between hydration and the next filter pass.
      nftCacheWrite(address, chainId, visibleItems);
      lastFetchedAtRef.current = Date.now();

      // For Ethereum, always fetch on-chain tokenURI to get fresh images
      // (Blockscout can cache stale pre-reveal images for collections like Sheboshis)
      // For other chains, only fetch for items missing images
      if (chainId === 1 && visibleItems.length > 0) {
        loadTokenImages(visibleItems, network, true);
      } else if (visibleItems.some((item) => !item.imageUrl)) {
        loadTokenImages(visibleItems, network, false);
      }
    } catch (err) {
      console.error('[NFTGallery] Fetch failed:', err);
      const msg = err instanceof Error ? err.message : '';
      // Only surface an error if we have nothing cached to show. On silent
      // revalidation, keep the stale data visible instead of swapping to an
      // error state that blows away the gallery.
      const hasCached = nfts.length > 0;
      if (!hasCached) {
        if (msg && (msg.includes('temporarily unavailable') || msg.includes('HTTP'))) {
          setError(msg);
        } else {
          setError('Failed to load NFTs. Check your connection and try again.');
        }
      }
    } finally {
      setLoading(false);
    }
    // nfts intentionally excluded — we only read it to decide error handling
    // and stale-data handling, not to track for re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId]);

  const loadTokenImages = async (
    items: NFTItem[],
    network: ReturnType<typeof getNetworkByChainId>,
    forceRefresh = false,
  ) => {
    if (!network) return;

    const allRpcs = [network.rpcUrl, ...(network.rpcFallbacks ?? [])];
    const chain = {
      id: network.chainId,
      name: network.name,
      nativeCurrency: {
        name: network.nativeToken.symbol,
        symbol: network.nativeToken.symbol,
        decimals: 18,
      },
      rpcUrls: { default: { http: allRpcs } },
    } as const;

    const client = createPublicClient({
      chain,
      transport:
        allRpcs.length > 1
          ? fallback(allRpcs.map((url) => http(url, { timeout: 5_000 })))
          : http(allRpcs[0], { timeout: 5_000 }),
    });

    // Process in batches of 5 to avoid flooding the RPC
    // When forceRefresh is true, re-fetch all items to get fresh on-chain images
    const needImages = forceRefresh ? items : items.filter((item) => !item.imageUrl);
    const batchSize = 5;

    for (let i = 0; i < needImages.length; i += batchSize) {
      const batch = needImages.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (nft) => {
          let uri: string | undefined;

          // Try ERC-721 tokenURI first, then ERC-1155 uri
          try {
            uri = (await client.readContract({
              address: nft.contractAddress as `0x${string}`,
              abi: TOKEN_URI_ABI,
              functionName: 'tokenURI',
              args: [BigInt(nft.tokenId)],
            })) as string;
          } catch {
            try {
              uri = (await client.readContract({
                address: nft.contractAddress as `0x${string}`,
                abi: TOKEN_URI_ABI,
                functionName: 'uri',
                args: [BigInt(nft.tokenId)],
              })) as string;
            } catch {
              // No URI available
            }
          }

          if (!uri) return null;

          const resolvedUri = resolveUri(uri);

          // If the URI itself looks like an image, use it directly
          if (/\.(png|jpg|jpeg|gif|svg|webp)(\?.*)?$/i.test(resolvedUri)) {
            return { contractAddress: nft.contractAddress, tokenId: nft.tokenId, imageUrl: resolvedUri };
          }

          // Otherwise treat it as JSON metadata
          try {
            const metaRes = await fetch(resolvedUri, { signal: AbortSignal.timeout(8000) });
            if (!metaRes.ok) return null;
            const meta = await metaRes.json();
            if (meta.image) {
              return {
                contractAddress: nft.contractAddress,
                tokenId: nft.tokenId,
                imageUrl: resolveUri(meta.image),
              };
            }
          } catch {
            // Metadata fetch failed
          }

          return null;
        }),
      );

      // Update state with any resolved images
      const updates: Record<string, string> = {};
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const key = `${result.value.contractAddress.toLowerCase()}-${result.value.tokenId}`;
          updates[key] = result.value.imageUrl;
        }
      }

      if (Object.keys(updates).length > 0) {
        setNfts((prev) => {
          const merged = prev.map((nft) => {
            const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
            if (updates[key]) {
              return { ...nft, imageUrl: updates[key] };
            }
            return nft;
          });
          // Persist the enriched images so reopening the tab shows them
          // instantly next time.
          nftCacheWrite(address, chainId, merged);
          return merged;
        });
      }
    }
  };

  // Re-apply the pending-sent filter on visibility change / storage events so
  // that returning from a successful send immediately hides the sent NFTs
  // even if `nfts` state still happens to hold them (belt-and-suspenders on
  // top of the fetch-time filter).
  const [pendingTick, setPendingTick] = useState(0);
  useEffect(() => {
    const bump = () => setPendingTick((n) => n + 1);
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'shibwallet_pending_sent_nfts') bump();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', bump);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // The rendered list of NFTs always goes through the pending-sent filter
  // before reaching the UI. This guards against any code path that writes
  // to `nfts` without pre-filtering, and reacts to pendingTick bumps so a
  // new send hides its tokens without needing a fresh fetch.
  const visibleNfts = useMemo(
    () => filterPendingSent(nfts, getPendingSent(chainId, address)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nfts, chainId, address, pendingTick],
  );

  // Group NFTs by collection (contract address)
  const collections = useMemo(() => {
    const map = new Map<string, { name: string; standard: string; nfts: NFTItem[] }>();
    for (const nft of visibleNfts) {
      const key = nft.contractAddress.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: nft.contractName, standard: nft.tokenStandard, nfts: [] });
      }
      map.get(key)!.nfts.push(nft);
    }
    return Array.from(map.entries())
      .map(([addr, data]) => ({ address: addr, ...data }))
      .sort((a, b) => b.nfts.length - a.nfts.length);
  }, [visibleNfts]);

  // null = show all collections, string = show that collection's NFTs
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);

  // Auto-select if only 1 visible collection (hidden ones don't count —
  // otherwise hiding the single collection you own would still auto-drill
  // into it).
  useEffect(() => {
    const visible = collections.filter((c) => !hiddenSet.has(c.address.toLowerCase()));
    if (visible.length === 1) {
      setSelectedCollection(visible[0].address);
    }
  }, [collections, hiddenSet]);

  // Reset selection when chain/address changes
  useEffect(() => {
    setSelectedCollection(null);
  }, [address, chainId]);

  // When address or chainId changes (e.g. switching accounts), hydrate
  // from the new address's cache and reset the fetch timer so the TTL
  // check in the fetch effect doesn't skip the request.
  const prevFetchAddrRef = useRef(address);
  const prevFetchChainRef = useRef(chainId);
  useEffect(() => {
    if (prevFetchAddrRef.current !== address || prevFetchChainRef.current !== chainId) {
      const cached = nftCacheRead(address, chainId);
      setNfts(filterPendingSent(cached?.items ?? [], getPendingSent(chainId, address)));
      setLoading(!cached);
      setError(null);
      lastFetchedAtRef.current = 0; // force refetch
      prevFetchAddrRef.current = address;
      prevFetchChainRef.current = chainId;
    }
  }, [address, chainId]);

  useEffect(() => {
    let cancelled = false;
    // On mount: if cache is fresh (< TTL), skip the fetch entirely.
    // If cache is stale (or missing), trigger a fetch — silent if we
    // already have cached items to display, loud otherwise.
    const age = Date.now() - lastFetchedAtRef.current;
    const hasCached = lastFetchedAtRef.current > 0;
    if (!hasCached || age > NFT_CACHE_TTL_MS) {
      fetchNFTs({ silent: hasCached }).catch(() => {});
    }
    // Retry on visibility change ONLY if the data is stale. Aggressive
    // refetching on every focus change was causing the tab to feel slow.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      const ageNow = Date.now() - lastFetchedAtRef.current;
      if (ageNow > NFT_CACHE_TTL_MS) {
        fetchNFTs({ silent: nfts.length > 0 }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNFTs]);

  // Must be defined BEFORE early returns — hooks cannot be conditional.
  const handleToggleSelect = useCallback(
    (nft: NFTItem) => {
      const sel: SelectedNFT = {
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        contractName: nft.contractName,
        tokenStandard: nft.tokenStandard,
        imageUrl: nft.imageUrl,
        quantity: 1,
        balance: nft.balance,
      };
      toggle(sel);
    },
    [toggle],
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-red-400">
            <path d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-sm text-gray-400">{error}</p>
        <button
          onClick={() => fetchNFTs({ force: true })}
          className="mt-3 px-4 py-1.5 text-xs font-medium text-[#FF6900] rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  if (visibleNfts.length === 0) {
    return (
      <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-gray-600">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-400">No NFTs found</p>
        <p className="text-xs text-gray-600 mt-1.5">NFTs you own will appear here</p>
      </div>
    );
  }

  // === Drilled-in: show a single collection's NFTs ===
  const activeCollection = selectedCollection
    ? collections.find((c) => c.address === selectedCollection)
    : null;

  const isErc1155Collection = activeCollection?.standard === 'ERC-1155';

  if (activeCollection) {
    return (
      <div className="animate-fade-in">
        {/* Back bar */}
        {collections.length > 1 && (
          <button
            onClick={() => { setSelectedCollection(null); clearSelection(); }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors mb-4 active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All Collections
          </button>
        )}

        {/* Collection title bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/[0.08]">
            {(() => {
              const thumb = activeCollection.nfts.find((n) => n.imageUrl);
              const hue = parseInt(activeCollection.address.slice(2, 8), 16) % 360;
              return thumb?.imageUrl ? (
                <img src={thumb.imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, hsl(${hue}, 60%, 20%), hsl(${(hue + 40) % 360}, 50%, 12%))` }}
                >
                  <span className="text-xs font-bold text-white/40">{activeCollection.name.slice(0, 2).toUpperCase()}</span>
                </div>
              );
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{activeCollection.name}</p>
            <p className="text-[11px] text-gray-500">
              {(() => {
                // ERC-1155: sum balances so "126 items" reflects total copies,
                // not just unique tokenIds. ERC-721 balances are always 1.
                const total = isErc1155Collection
                  ? activeCollection.nfts.reduce((sum, n) => sum + (n.balance || 1), 0)
                  : activeCollection.nfts.length;
                return `${total} item${total !== 1 ? 's' : ''}`;
              })()}
              <span className="mx-1.5 text-gray-700">·</span>
              {activeCollection.standard}
              <span className="mx-1.5 text-gray-700">·</span>
              <span className="font-mono">
                {`${activeCollection.address.slice(0, 6)}...${activeCollection.address.slice(-4)}`}
              </span>
            </p>
          </div>

          {/* Selection hint / Send button */}
          {selectionMode ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={clearSelection}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-400
                           bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => navigate('/wallet/send-nft')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white
                           bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                           hover:shadow-[0_0_15px_rgba(255,105,0,0.3)] transition-all active:scale-95"
              >
                Send{(() => {
                  const totalQty = selected.reduce((sum, s) => sum + (s.quantity || 1), 0);
                  return totalQty > 1 ? ` (${totalQty})` : '';
                })()}
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-gray-600 shrink-0 max-w-[90px] text-right leading-tight">
              Long-press for actions
            </p>
          )}
        </div>

        {/* NFT grid */}
        <div className="grid grid-cols-2 gap-3">
          {activeCollection.nfts.map((nft, i) => (
            <div
              key={`${nft.contractAddress}-${nft.tokenId}`}
              style={{ animation: `slide-up-fade 0.3s ease-out ${i * 40}ms both` }}
            >
              <NFTCard
                nft={nft}
                selectionMode={selectionMode}
                isSelected={isSelected(nft.contractAddress, nft.tokenId)}
                selectedQty={getQuantity(nft.contractAddress, nft.tokenId)}
                // When already in selection mode, long-press keeps the fast
                // toggle-add/increment behavior. Otherwise the long-press
                // opens the action menu (copy, quantity, send-now).
                onLongPress={() =>
                  selectionMode ? handleToggleSelect(nft) : setActionMenuNft(nft)
                }
                onTap={() => handleToggleSelect(nft)}
              />
            </div>
          ))}
        </div>

        {actionMenuNft && (
          <NFTActionMenu
            nft={actionMenuNft}
            onClose={() => setActionMenuNft(null)}
            onSendNow={(qty) => {
              replaceWithSingle({
                contractAddress: actionMenuNft.contractAddress,
                tokenId: actionMenuNft.tokenId,
                contractName: actionMenuNft.contractName,
                tokenStandard: actionMenuNft.tokenStandard,
                imageUrl: actionMenuNft.imageUrl,
                quantity: qty,
                balance: actionMenuNft.balance,
              });
              setActionMenuNft(null);
              navigate('/wallet/send-nft');
            }}
            onAddToSelection={(qty) => {
              const payload: SelectedNFT = {
                contractAddress: actionMenuNft.contractAddress,
                tokenId: actionMenuNft.tokenId,
                contractName: actionMenuNft.contractName,
                tokenStandard: actionMenuNft.tokenStandard,
                imageUrl: actionMenuNft.imageUrl,
                quantity: 1,
                balance: actionMenuNft.balance,
              };
              // toggle() adds at qty=1 on first call, then increments on each
              // subsequent call (up to balance) for ERC-1155s. Call repeatedly
              // to reach the requested qty.
              const already = getQuantity(actionMenuNft.contractAddress, actionMenuNft.tokenId);
              const needed = Math.max(0, qty - already);
              for (let i = 0; i < needed; i++) toggle(payload);
              setActionMenuNft(null);
              toast.success(
                qty > 1 ? `Added ${qty} to selection` : 'Added to selection',
              );
            }}
          />
        )}
      </div>
    );
  }

  // === Top-level: Collection tiles grid ===
  const visibleCollections = collections.filter(
    (c) => !hiddenSet.has(c.address.toLowerCase()),
  );
  const hiddenCollections = collections.filter((c) =>
    hiddenSet.has(c.address.toLowerCase()),
  );

  const visibleTotalCount = visibleCollections.reduce(
    (sum, c) => sum + c.nfts.reduce((s, n) => s + (n.balance || 1), 0),
    0,
  );

  return (
    <div>
      {/* Summary — sum balances so ERC-1155 copies are counted, not just unique ids */}
      <p className="text-xs text-gray-500 mb-3 px-1">
        {visibleTotalCount} NFT{visibleTotalCount !== 1 ? 's' : ''} in {visibleCollections.length} collection{visibleCollections.length !== 1 ? 's' : ''}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {visibleCollections.map((collection, ci) => (
          <CollectionTile
            key={collection.address}
            collection={collection}
            index={ci}
            hidden={false}
            onOpen={() => setSelectedCollection(collection.address)}
            onLongPress={() => handleHideCollection(collection.address, collection.name)}
          />
        ))}
      </div>

      {hiddenCollections.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowHidden((v) => !v)}
            className="w-full text-center text-xs font-medium text-gray-500 hover:text-gray-300
                       bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-xl
                       py-2.5 transition-colors active:scale-[0.99]"
          >
            {showHidden ? '▾ Hide hidden' : '▸ Show hidden'} ({hiddenCollections.length})
          </button>

          {showHidden && (
            <>
              <p className="text-[10px] text-gray-600 mt-3 mb-2 px-1 text-center">
                Long-press a hidden collection to restore it.
              </p>
              <div className="grid grid-cols-2 gap-3 opacity-70">
                {hiddenCollections.map((collection, ci) => (
                  <CollectionTile
                    key={collection.address}
                    collection={collection}
                    index={ci}
                    hidden
                    onOpen={() => setSelectedCollection(collection.address)}
                    onLongPress={() => handleUnhideCollection(collection.address, collection.name)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

interface CollectionTileProps {
  collection: { address: string; name: string; standard: string; nfts: NFTItem[] };
  index: number;
  hidden: boolean;
  onOpen: () => void;
  onLongPress: () => void;
}

const CollectionTile: React.FC<CollectionTileProps> = ({
  collection,
  index,
  hidden,
  onOpen,
  onLongPress,
}) => {
  const hue = parseInt(collection.address.slice(2, 8), 16) % 360;
  const previewNfts = collection.nfts.filter((n) => n.imageUrl).slice(0, 4);
  const totalCount =
    collection.standard === 'ERC-1155'
      ? collection.nfts.reduce((sum, n) => sum + (n.balance || 1), 0)
      : collection.nfts.length;

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const onPointerDown = () => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const onPointerUp = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!didLongPress.current) onOpen();
  };
  const onPointerLeave = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  return (
    <div
      className={`bg-white/[0.03] backdrop-blur-xl border ${hidden ? 'border-white/[0.04] border-dashed' : 'border-white/[0.06]'} rounded-2xl overflow-hidden
                 transition-all duration-300 hover:border-white/[0.12] hover:shadow-lg
                 active:scale-[0.97] text-left group select-none cursor-pointer`}
      style={{ animation: `slide-up-fade 0.4s ease-out ${index * 50}ms both` }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Mosaic thumbnail grid */}
      <div className="aspect-square relative overflow-hidden">
        {previewNfts.length >= 4 ? (
          <div className="grid grid-cols-2 w-full h-full">
            {previewNfts.slice(0, 4).map((nft, i) => (
              <img
                key={nft.tokenId}
                src={nft.imageUrl!}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
                style={{
                  borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                }}
              />
            ))}
          </div>
        ) : previewNfts.length >= 1 ? (
          <img
            src={previewNfts[0].imageUrl!}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, hsl(${hue}, 60%, 18%) 0%, hsl(${(hue + 40) % 360}, 50%, 10%) 100%)`,
            }}
          >
            <span className="text-3xl font-bold text-white/20">
              {collection.name.split(/[\s-_]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
            </span>
          </div>
        )}

        {/* Count badge */}
        <div className="absolute top-2 right-2">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/70 backdrop-blur-sm text-white border border-white/[0.1]">
            {totalCount}
          </span>
        </div>

        {hidden && (
          <div className="absolute top-2 left-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 backdrop-blur-sm text-gray-300 border border-white/[0.1]">
              Hidden
            </span>
          </div>
        )}

        {/* Bottom gradient overlay for text readability */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}
        />
      </div>

      {/* Collection info */}
      <div className="p-3">
        <p className="text-xs font-semibold text-white truncate group-hover:text-[#FF6900] transition-colors">
          {collection.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-500">
            {collection.standard}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NFTGallery;
