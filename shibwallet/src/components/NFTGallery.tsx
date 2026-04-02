import React, { useEffect, useState, useCallback } from 'react';
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

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

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

      if (chainId === 109) {
        // Shibarium - use Blockscout v2 API
        const url = `https://www.shibariumscan.io/api/v2/addresses/${address}/tokens?type=ERC-721%2CERC-1155`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();

        if (data.items && Array.isArray(data.items)) {
          items = data.items.map((item: any) => {
            let imageUrl: string | null = null;
            const metadata = item.token?.instance?.metadata ?? item.metadata;
            if (metadata?.image) {
              imageUrl = resolveUri(metadata.image);
            } else if (item.image_url) {
              imageUrl = resolveUri(item.image_url);
            }
            return {
              contractAddress: item.token?.address ?? '',
              tokenId: item.id ?? item.token_id ?? item.value ?? '0',
              contractName: item.token?.name ?? 'Unknown',
              tokenStandard: item.token?.type === 'ERC-1155' ? 'ERC-1155' : 'ERC-721',
              imageUrl,
            };
          });
        }
      } else {
        // Ethereum and other chains - use Etherscan-compatible API
        const baseUrl = chainId === 1 ? 'https://api.etherscan.io' : network.explorerUrl;

        // Fetch ERC-721 and ERC-1155 transfers in parallel
        const [erc721Url, erc1155Url] = [
          `${baseUrl}/api?module=account&action=tokennfttx&address=${address}&page=1&offset=50&sort=desc`,
          `${baseUrl}/api?module=account&action=token1155tx&address=${address}&page=1&offset=50&sort=desc`,
        ];

        const [res721, res1155] = await Promise.all([
          fetch(erc721Url).catch(() => null),
          fetch(erc1155Url).catch(() => null),
        ]);

        const allTransfers: any[] = [];

        if (res721 && res721.ok) {
          const data721 = await res721.json();
          if (data721.result && Array.isArray(data721.result)) {
            allTransfers.push(...data721.result.map((tx: any) => ({ ...tx, tokenType: 'ERC-721' })));
          }
        }

        if (res1155 && res1155.ok) {
          const data1155 = await res1155.json();
          if (data1155.result && Array.isArray(data1155.result)) {
            allTransfers.push(...data1155.result.map((tx: any) => ({ ...tx, tokenType: 'ERC-1155' })));
          }
        }

        // If both requests failed, throw to show error state
        if (!res721?.ok && !res1155?.ok) {
          throw new Error('Failed to fetch NFT data from explorer API');
        }

        // Sort all transfers by block number descending so latest transfer comes first
        allTransfers.sort((a, b) => Number(b.blockNumber ?? 0) - Number(a.blockNumber ?? 0));

        if (allTransfers.length >= 0) {
          // Deduplicate by contract + tokenId, keep only NFTs currently owned
          const nftMap = new Map<string, { contractAddress: string; tokenId: string; contractName: string; tokenStandard: string; owned: boolean }>();

          for (const tx of allTransfers) {
            const key = `${tx.contractAddress.toLowerCase()}-${tx.tokenID}`;
            const isIncoming = tx.to.toLowerCase() === address.toLowerCase();

            if (!nftMap.has(key)) {
              nftMap.set(key, {
                contractAddress: tx.contractAddress,
                tokenId: tx.tokenID,
                contractName: tx.tokenName || 'Unknown',
                tokenStandard: tx.tokenType === 'ERC-1155' ? 'ERC-1155' : 'ERC-721',
                owned: isIncoming,
              });
            }
            // The API returns sorted desc, so the first occurrence is the latest transfer
          }

          // Filter to only owned NFTs
          items = Array.from(nftMap.values())
            .filter((n) => n.owned)
            .map((n) => ({
              ...n,
              imageUrl: null,
            }));
        }
      }

      setNfts(items);

      // Try to load images via tokenURI for items without images
      if (items.some((item) => !item.imageUrl)) {
        loadTokenImages(items, network);
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
    const needImages = items.filter((item) => !item.imageUrl);
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

  return (
    <div className="grid grid-cols-2 gap-3">
      {nfts.map((nft, i) => (
        <div
          key={`${nft.contractAddress}-${nft.tokenId}`}
          style={{ animation: `slide-up-fade 0.4s ease-out ${i * 50}ms both` }}
        >
          <NFTCard nft={nft} />
        </div>
      ))}
    </div>
  );
};

export default NFTGallery;
