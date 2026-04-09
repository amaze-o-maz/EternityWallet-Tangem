import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPublicClient, http, fallback } from 'viem';
import { getNetworkByChainId } from '../lib/chains';

interface NFTItem {
  contractAddress: string;
  tokenId: string;
  contractName: string;
  tokenStandard: string;
  imageUrl: string | null;
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

const NFTCard: React.FC<{ nft: NFTItem }> = ({ nft }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const truncatedId =
    nft.tokenId.length > 8 ? nft.tokenId.slice(0, 4) + '...' + nft.tokenId.slice(-4) : nft.tokenId;

  return (
    <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/[0.12] hover:shadow-lg group">
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
        {/* Token standard badge */}
        <div className="absolute top-2 right-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/60 backdrop-blur-sm text-gray-300 border border-white/[0.08]">
            {nft.tokenStandard}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-white truncate">{nft.contractName || 'Unknown Collection'}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 font-mono">#{truncatedId}</p>
      </div>
    </div>
  );
};

const NFTGallery: React.FC<NFTGalleryProps> = ({ address, chainId }) => {
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNFTs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const network = getNetworkByChainId(chainId);
    if (!network) {
      setError('Network not supported');
      setLoading(false);
      return;
    }

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
        const url = `${blockscoutBase}/api/v2/addresses/${address}/nft?type=ERC-721%2CERC-1155`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();

        if (data.items && Array.isArray(data.items)) {
          // Paginate if there are more results
          let allItems = [...data.items];
          let nextParams = data.next_page_params;

          // Fetch up to 3 additional pages (max ~200 NFTs)
          let page = 0;
          while (nextParams && page < 3) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(nextParams)) {
              params.set(k, String(v));
            }
            const nextUrl = `${blockscoutBase}/api/v2/addresses/${address}/nft?type=ERC-721%2CERC-1155&${params.toString()}`;
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
            // Blockscout provides image_url directly, also check metadata
            if (item.image_url) {
              imageUrl = resolveUri(item.image_url);
            } else if (item.metadata?.image) {
              imageUrl = resolveUri(item.metadata.image);
            }
            return {
              contractAddress: item.token?.address_hash ?? item.token?.address ?? '',
              tokenId: item.id ?? '0',
              contractName: item.token?.name ?? 'Unknown',
              tokenStandard: item.token_type ?? (item.token?.type === 'ERC-1155' ? 'ERC-1155' : 'ERC-721'),
              imageUrl,
            };
          });
        }
      } else {
        // Unsupported chain for NFTs
        items = [];
      }

      setNfts(items);

      // For Ethereum, always fetch on-chain tokenURI to get fresh images
      // (Blockscout can cache stale pre-reveal images for collections like Sheboshis)
      // For other chains, only fetch for items missing images
      if (chainId === 1 && items.length > 0) {
        loadTokenImages(items, network, true);
      } else if (items.some((item) => !item.imageUrl)) {
        loadTokenImages(items, network, false);
      }
    } catch (err) {
      console.error('[NFTGallery] Fetch failed:', err);
      setError('Failed to load NFTs');
    } finally {
      setLoading(false);
    }
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
          ? fallback(allRpcs.map((url) => http(url, { timeout: 10_000 })))
          : http(allRpcs[0], { timeout: 10_000 }),
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
        setNfts((prev) =>
          prev.map((nft) => {
            const key = `${nft.contractAddress.toLowerCase()}-${nft.tokenId}`;
            if (updates[key]) {
              return { ...nft, imageUrl: updates[key] };
            }
            return nft;
          }),
        );
      }
    }
  };

  // Group NFTs by collection (contract address)
  const collections = useMemo(() => {
    const map = new Map<string, { name: string; standard: string; nfts: NFTItem[] }>();
    for (const nft of nfts) {
      const key = nft.contractAddress.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name: nft.contractName, standard: nft.tokenStandard, nfts: [] });
      }
      map.get(key)!.nfts.push(nft);
    }
    return Array.from(map.entries())
      .map(([addr, data]) => ({ address: addr, ...data }))
      .sort((a, b) => b.nfts.length - a.nfts.length);
  }, [nfts]);

  // null = show all collections, string = show that collection's NFTs
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);

  // Auto-select if only 1 collection
  useEffect(() => {
    if (collections.length === 1) {
      setSelectedCollection(collections[0].address);
    }
  }, [collections.length]);

  // Reset selection when chain/address changes
  useEffect(() => {
    setSelectedCollection(null);
  }, [address, chainId]);

  useEffect(() => {
    fetchNFTs();
  }, [fetchNFTs]);

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
          onClick={fetchNFTs}
          className="mt-3 px-4 py-1.5 text-xs font-medium text-[#FF6900] rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  if (nfts.length === 0) {
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

  if (activeCollection) {
    return (
      <div className="animate-fade-in">
        {/* Back bar */}
        {collections.length > 1 && (
          <button
            onClick={() => setSelectedCollection(null)}
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
              {activeCollection.nfts.length} item{activeCollection.nfts.length !== 1 ? 's' : ''}
              <span className="mx-1.5 text-gray-700">·</span>
              {activeCollection.standard}
            </p>
          </div>
        </div>

        {/* NFT grid */}
        <div className="grid grid-cols-2 gap-3">
          {activeCollection.nfts.map((nft, i) => (
            <div
              key={`${nft.contractAddress}-${nft.tokenId}`}
              style={{ animation: `slide-up-fade 0.3s ease-out ${i * 40}ms both` }}
            >
              <NFTCard nft={nft} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // === Top-level: Collection tiles grid ===
  return (
    <div>
      {/* Summary */}
      <p className="text-xs text-gray-500 mb-3 px-1">
        {nfts.length} NFT{nfts.length !== 1 ? 's' : ''} in {collections.length} collection{collections.length !== 1 ? 's' : ''}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {collections.map((collection, ci) => {
          const hue = parseInt(collection.address.slice(2, 8), 16) % 360;
          const previewNfts = collection.nfts.filter((n) => n.imageUrl).slice(0, 4);
          // Fill remaining slots if we don't have 4 images
          const gridCount = Math.min(collection.nfts.length, 4);

          return (
            <button
              key={collection.address}
              onClick={() => setSelectedCollection(collection.address)}
              className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden
                         transition-all duration-300 hover:border-white/[0.12] hover:shadow-lg
                         active:scale-[0.97] text-left group"
              style={{ animation: `slide-up-fade 0.4s ease-out ${ci * 50}ms both` }}
            >
              {/* Mosaic thumbnail grid */}
              <div className="aspect-square relative overflow-hidden">
                {previewNfts.length >= 4 ? (
                  // 2x2 mosaic
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
                  // Single featured image
                  <img
                    src={previewNfts[0].imageUrl!}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // Gradient placeholder
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
                    {collection.nfts.length}
                  </span>
                </div>

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
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NFTGallery;
