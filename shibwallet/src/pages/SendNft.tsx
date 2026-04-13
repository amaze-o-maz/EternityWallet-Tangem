import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  formatUnits,
  encodeFunctionData,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArrowLeft, ExternalLink, X, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import ReviewModal from '../components/ReviewModal';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useTransactionStore } from '../store/transactionStore';
import { useNftSelectionStore } from '../store/nftSelectionStore';
import { isShibName, resolveShibName, formatShibName } from '../lib/sns';
import { getNetworkByChainId, getExplorerTxUrl } from '../lib/chains';
import { ERC721_ABI, ERC1155_ABI } from '../lib/abis';
import { fetchPrices } from '../lib/prices';

const SendNft: React.FC = () => {
  const navigate = useNavigate();
  const { address, privateKey, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const { selected, clearSelection } = useNftSelectionStore();

  const [toAddress, setToAddress] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [txNonce, setTxNonce] = useState<number | null>(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // SNS
  const [snsResolvedAddr, setSnsResolvedAddr] = useState<string | null>(null);
  const [snsResolving, setSnsResolving] = useState(false);
  const [snsError, setSnsError] = useState(false);
  const [snsNetworkError, setSnsNetworkError] = useState(false);

  const network = useMemo(() => getNetworkByChainId(chainId), [chainId]);

  const viemChain = useMemo<Chain | null>(() => {
    if (!network) return null;
    return {
      id: network.chainId,
      name: network.name,
      nativeCurrency: {
        name: network.nativeToken.symbol,
        symbol: network.nativeToken.symbol,
        decimals: 18,
      },
      rpcUrls: {
        default: { http: [network.rpcUrl, ...(network.rpcFallbacks ?? [])] },
      },
    };
  }, [network]);

  const publicClient = useMemo(() => {
    if (!network || !viemChain) return null;
    const allRpcs = [network.rpcUrl, ...(network.rpcFallbacks ?? [])];
    return createPublicClient({
      chain: viemChain,
      transport: allRpcs.length > 1
        ? fallback(allRpcs.map((url) => http(url, { timeout: 5_000 })))
        : http(allRpcs[0], { timeout: 5_000 }),
    });
  }, [network, viemChain]);

  // Redirect if nothing selected or not unlocked — but NOT if we
  // already have a txHash (success modal is showing after clearSelection).
  useEffect(() => {
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
      return;
    }
    if (selected.length === 0 && !txHash) {
      navigate('/wallet', { replace: true });
    }
  }, [isUnlocked, selected.length, txHash, navigate]);

  useEffect(() => {
    fetchPrices().then(setPrices).catch(() => {});
  }, []);

  // Derive info from selection
  const isErc1155 = selected.length > 0 && selected[0].tokenStandard === 'ERC-1155';
  const collectionName = selected[0]?.contractName ?? 'NFT';
  const contractAddr = selected[0]?.contractAddress ?? '';
  const previewImage = selected.find((s) => s.imageUrl)?.imageUrl ?? null;

  // SNS resolution
  useEffect(() => {
    setSnsResolvedAddr(null);
    setSnsError(false);
    setSnsNetworkError(false);

    if (!isShibName(toAddress)) {
      setSnsResolving(false);
      return;
    }

    setSnsResolving(true);
    const timer = setTimeout(async () => {
      try {
        const addr = await resolveShibName(toAddress, chainId);
        if (addr) {
          setSnsResolvedAddr(addr);
        } else {
          setSnsError(true);
        }
      } catch {
        setSnsNetworkError(true);
      } finally {
        setSnsResolving(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [toAddress, chainId]);

  const effectiveAddress = snsResolvedAddr ?? toAddress;
  const isValidAddress = effectiveAddress.startsWith('0x') && effectiveAddress.length === 42;
  const isSnsMode = isShibName(toAddress);

  // Gas estimation
  useEffect(() => {
    const gasTarget = snsResolvedAddr ?? toAddress;
    if (!publicClient || !address || !gasTarget || selected.length === 0) {
      setGasEstimate(null);
      return;
    }
    if (!gasTarget.startsWith('0x') || gasTarget.length !== 42) {
      setGasEstimate(null);
      return;
    }

    const estimate = async () => {
      setEstimatingGas(true);
      try {
        let data: `0x${string}`;
        const from = address as `0x${string}`;
        const to = gasTarget as `0x${string}`;
        const nftAddr = contractAddr as `0x${string}`;

        if (isErc1155 && selected.length > 1) {
          // safeBatchTransferFrom — multiple token IDs, each with its own quantity
          data = encodeFunctionData({
            abi: ERC1155_ABI,
            functionName: 'safeBatchTransferFrom',
            args: [
              from,
              to,
              selected.map((s) => BigInt(s.tokenId)),
              selected.map((s) => BigInt(s.quantity || 1)),
              '0x',
            ],
          });
        } else if (isErc1155) {
          // single ERC-1155 token ID (may transfer multiple copies)
          data = encodeFunctionData({
            abi: ERC1155_ABI,
            functionName: 'safeTransferFrom',
            args: [from, to, BigInt(selected[0].tokenId), BigInt(selected[0].quantity || 1), '0x'],
          });
        } else {
          // ERC-721
          data = encodeFunctionData({
            abi: ERC721_ABI,
            functionName: 'safeTransferFrom',
            args: [from, to, BigInt(selected[0].tokenId)],
          });
        }

        const [gas, gp, nonce] = await Promise.all([
          publicClient.estimateGas({ account: from, to: nftAddr, data }),
          publicClient.getGasPrice(),
          publicClient.getTransactionCount({ address: from, blockTag: 'pending' }),
        ]);
        setGasEstimate(gas);
        setGasPrice(gp);
        setTxNonce(nonce);
      } catch {
        setGasEstimate(null);
      } finally {
        setEstimatingGas(false);
      }
    };

    const timer = setTimeout(estimate, 500);
    return () => clearTimeout(timer);
  }, [publicClient, address, toAddress, snsResolvedAddr, selected, contractAddr, isErc1155]);

  const handleReview = () => {
    if (!isValidAddress) {
      toast.error('Please enter a valid address or .shib name');
      return;
    }
    if (address && effectiveAddress.toLowerCase() === address.toLowerCase()) {
      toast.error('Cannot send to yourself');
      return;
    }
    setReviewOpen(true);
  };

  const handleConfirmSend = useCallback(async () => {
    if (!privateKey || !network || !viemChain || !publicClient || selected.length === 0) return;

    setSending(true);
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const rpcs = [network.rpcUrl, ...(network.rpcFallbacks ?? [])];
      const walletClient = createWalletClient({
        chain: viemChain,
        transport: rpcs.length > 1
          ? fallback(rpcs.map((url) => http(url, { timeout: 5_000 })))
          : http(rpcs[0], { timeout: 5_000 }),
        account,
      });

      const from = address as `0x${string}`;
      const to = effectiveAddress as `0x${string}`;
      const nftAddr = contractAddr as `0x${string}`;
      let hash: `0x${string}`;

      // Pass pre-computed gas, gasPrice, and nonce to skip most RPC calls
      // in viem's prepareTransactionRequest — avoids eth_estimateGas,
      // eth_gasPrice, and eth_getTransactionCount.
      const gasOpts: Record<string, any> = {};
      if (gasEstimate) gasOpts.gas = gasEstimate;
      if (gasPrice) gasOpts.gasPrice = gasPrice;
      if (txNonce !== null) gasOpts.nonce = txNonce;

      if (isErc1155 && selected.length > 1) {
        hash = await walletClient.writeContract({
          address: nftAddr,
          abi: ERC1155_ABI,
          functionName: 'safeBatchTransferFrom',
          args: [
            from,
            to,
            selected.map((s) => BigInt(s.tokenId)),
            selected.map((s) => BigInt(s.quantity || 1)),
            '0x',
          ],
          ...gasOpts,
        });
      } else if (isErc1155) {
        hash = await walletClient.writeContract({
          address: nftAddr,
          abi: ERC1155_ABI,
          functionName: 'safeTransferFrom',
          args: [from, to, BigInt(selected[0].tokenId), BigInt(selected[0].quantity || 1), '0x'],
          ...gasOpts,
        });
      } else {
        hash = await walletClient.writeContract({
          address: nftAddr,
          abi: ERC721_ABI,
          functionName: 'safeTransferFrom',
          args: [from, to, BigInt(selected[0].tokenId)],
          ...gasOpts,
        });
      }

      setTxHash(hash);
      setReviewOpen(false);
      setShowSuccessModal(true);
      setCopiedHash(false);

      try {
        addTransaction({
          hash,
          from: address!,
          to: effectiveAddress,
          value: '0',
          timeStamp: Math.floor(Date.now() / 1000).toString(),
          type: 'send-nft',
          chainId,
          nftContract: contractAddr,
          nftTokenIds: selected.map((s) => s.tokenId),
          nftStandard: selected[0].tokenStandard,
          nftCollectionName: collectionName,
          nftImageUrl: previewImage ?? undefined,
        });
      } catch {
        // Don't let history recording errors affect the success display
      }

      // Invalidate NFT cache so the gallery refetches on return —
      // the sent NFTs should no longer appear in the sender's list.
      try {
        const raw = localStorage.getItem('shibwallet_nft_cache');
        if (raw) {
          const all = JSON.parse(raw);
          const key = `${chainId}:${address!.toLowerCase()}`;
          delete all[key];
          localStorage.setItem('shibwallet_nft_cache', JSON.stringify(all));
        }
      } catch { /* ignore */ }

      // NOTE: Do NOT call clearSelection() here. It updates the Zustand
      // store synchronously, triggering a re-render before React flushes
      // the batched setTxHash/setShowSuccessModal updates. The redirect
      // guard would see selected.length===0 with txHash still null and
      // navigate away before the success modal renders. Selection is
      // cleared when the user taps "Back to Wallet" instead.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setSending(false);
    }
  }, [
    privateKey, network, viemChain, publicClient, selected,
    address, effectiveAddress, contractAddr, isErc1155, gasEstimate, gasPrice, txNonce,
    addTransaction, chainId, collectionName, previewImage,
  ]);

  const handleCopyHash = useCallback(() => {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash).then(() => {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }).catch(() => {});
  }, [txHash]);

  if (!isUnlocked || !address || (selected.length === 0 && !txHash)) return null;

  return (
    <div className="safe-top flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md mx-auto w-full px-5 py-8 relative z-10">
        {/* Back */}
        <button
          onClick={() => { clearSelection(); navigate('/wallet'); }}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-8 active:scale-95"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-bold mb-8 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
          Send NFT
        </h1>

        {!txHash && (
          <div className="space-y-5">
            {/* Selected NFTs preview */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4">
              <div className="flex items-center gap-3">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover border border-white/[0.08]"
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center border border-white/[0.08]"
                    style={{
                      background: `linear-gradient(135deg, hsl(${parseInt(contractAddr.slice(2, 8) || '0', 16) % 360}, 60%, 20%), hsl(${(parseInt(contractAddr.slice(2, 8) || '0', 16) + 40) % 360}, 50%, 12%))`,
                    }}
                  >
                    <span className="text-sm font-bold text-white/40">
                      {collectionName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{collectionName}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {selected.length} item{selected.length !== 1 ? 's' : ''} selected
                    <span className="mx-1.5 text-gray-700">&middot;</span>
                    {selected[0].tokenStandard}
                  </p>
                </div>
              </div>

              {/* Token ID pills */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {selected.slice(0, 12).map((nft) => (
                  <span
                    key={nft.tokenId}
                    className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/[0.06] text-gray-400 border border-white/[0.06]"
                  >
                    #{nft.tokenId.length > 8
                      ? nft.tokenId.slice(0, 4) + '...' + nft.tokenId.slice(-4)
                      : nft.tokenId}
                  </span>
                ))}
                {selected.length > 12 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.04] text-gray-500">
                    +{selected.length - 12} more
                  </span>
                )}
              </div>
            </div>

            {/* To address */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Recipient</label>
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="0x... or name.shib"
                className={`w-full px-4 py-3.5 rounded-xl bg-white/[0.03] backdrop-blur-xl border
                           text-white placeholder-gray-600 focus:outline-none
                           transition-all duration-300 text-sm ${isSnsMode ? '' : 'font-mono'} ${
                  (toAddress && !isSnsMode && !isValidAddress) || snsError
                    ? 'border-red-500/50 focus:border-red-500/70 focus:shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                    : snsResolvedAddr
                      ? 'border-purple-500/50 focus:border-purple-500/70 focus:shadow-[0_0_15px_rgba(168,85,247,0.12)]'
                      : 'border-white/[0.06] focus:border-[#FF6900]/50 focus:shadow-[0_0_20px_rgba(255,105,0,0.12)]'
                }`}
              />

              {/* SNS status */}
              {isSnsMode && snsResolving && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-purple-400">Resolving {formatShibName(toAddress)}...</p>
                </div>
              )}
              {isSnsMode && snsResolvedAddr && !snsResolving && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/15">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
                    <circle cx="8" cy="8" r="7" stroke="#a855f7" strokeWidth="1.5" />
                    <path d="M5.5 8.5L7 10l3.5-4" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-xs text-purple-300 font-semibold">{formatShibName(toAddress)}</span>
                  <span className="text-[10px] text-gray-500 mx-1">&rarr;</span>
                  <span className="text-[10px] text-gray-400 font-mono">{snsResolvedAddr.slice(0, 8)}...{snsResolvedAddr.slice(-6)}</span>
                </div>
              )}
              {isSnsMode && snsError && !snsResolving && (
                <p className="text-xs text-red-400 mt-1.5">
                  Name not found &mdash; &quot;{formatShibName(toAddress)}&quot; is not registered
                </p>
              )}
              {isSnsMode && snsNetworkError && !snsResolving && (
                <p className="text-xs text-yellow-400 mt-1.5">
                  Could not resolve name &mdash; check your connection and try again
                </p>
              )}
              {toAddress && !isSnsMode && !isValidAddress && (
                <p className="text-xs text-red-400 mt-1.5">
                  Enter a valid address (0x-prefixed, 42 characters) or .shib name
                </p>
              )}
            </div>

            {/* Gas estimate */}
            {gasEstimate !== null && gasPrice !== null && (
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Estimated Gas Fee</span>
                  <div className="text-right">
                    <span className="text-white font-medium">
                      {parseFloat(formatUnits(gasEstimate * gasPrice, 18)).toFixed(8)} {network?.nativeToken.symbol}
                    </span>
                    {(() => {
                      const nativeSymbol = network?.nativeToken.symbol ?? '';
                      const price = prices[nativeSymbol] ?? 0;
                      if (price > 0) {
                        const usd = parseFloat(formatUnits(gasEstimate * gasPrice, 18)) * price;
                        return (
                          <span className="text-gray-500 text-xs ml-2">
                            (~${usd < 0.01 ? '<0.01' : usd.toFixed(2)})
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Send button */}
            <button
              onClick={handleReview}
              disabled={!isValidAddress}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              Review Transaction
            </button>
          </div>
        )}
      </div>

      {/* Review modal */}
      <ReviewModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={handleConfirmSend}
        title="Review NFT Transfer"
        confirmText={sending ? 'Sending...' : 'Confirm Send'}
        isLoading={sending}
      >
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Collection</span>
            <span className="text-white font-medium truncate ml-4">{collectionName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Items</span>
            <span className="text-white font-medium">
              {selected.reduce((sum, s) => sum + (s.quantity || 1), 0)} {selected[0].tokenStandard}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">To</span>
            <span className="text-white text-xs break-all">
              {isSnsMode && snsResolvedAddr ? (
                <span>
                  <span className="text-purple-300 font-semibold">{formatShibName(toAddress)}</span>{' '}
                  <span className="text-gray-500 font-mono">
                    ({effectiveAddress.slice(0, 6)}...{effectiveAddress.slice(-4)})
                  </span>
                </span>
              ) : (
                <span className="font-mono">{effectiveAddress}</span>
              )}
            </span>
          </div>
          {gasEstimate !== null && gasPrice !== null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Gas Fee</span>
              <div className="text-right">
                <span className="text-white font-medium">
                  {parseFloat(formatUnits(gasEstimate * gasPrice, 18)).toFixed(8)} {network?.nativeToken.symbol}
                </span>
                {(() => {
                  const nativeSymbol = network?.nativeToken.symbol ?? '';
                  const price = prices[nativeSymbol] ?? 0;
                  if (price > 0) {
                    const usd = parseFloat(formatUnits(gasEstimate * gasPrice, 18)) * price;
                    return (
                      <span className="text-gray-500 text-xs ml-1">
                        (~${usd < 0.01 ? '<0.01' : usd.toFixed(2)})
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}
          <div className="border-t border-white/[0.06] pt-3 mt-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              {isErc1155 && selected.length > 1
                ? `This will batch-transfer ${selected.reduce((sum, s) => sum + (s.quantity || 1), 0)} NFTs in a single transaction.`
                : 'Please verify all details. NFT transfers cannot be reversed.'}
            </p>
          </div>
        </div>
      </ReviewModal>

      {/* Success modal */}
      {showSuccessModal && txHash && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in pb-12" onClick={() => { clearSelection(); navigate('/wallet'); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#111] border border-white/[0.08] rounded-t-3xl p-6 animate-slide-up-fade"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end mb-2">
              <button
                onClick={() => { clearSelection(); navigate('/wallet'); }}
                className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-center">
              <div className="relative inline-block mb-5">
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(circle, rgba(34, 197, 94, 0.2) 0%, transparent 70%)',
                    transform: 'scale(2.5)',
                    filter: 'blur(20px)',
                  }}
                />
                <div className="relative w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto backdrop-blur-xl">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">NFT Transfer Sent</h2>
              <p className="text-xs text-gray-400 mb-5">Your NFT transfer has been submitted to the network</p>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-500">Transaction Hash</p>
                <button
                  onClick={handleCopyHash}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {copiedHash ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copiedHash ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-gray-300 font-mono break-all leading-relaxed">{txHash}</p>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-5 space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Collection</span>
                <span className="text-white font-medium">{collectionName}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Items</span>
                <span className="text-white font-medium">{selected.length > 0 ? selected.reduce((sum, s) => sum + (s.quantity || 1), 0) : 'Sent'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">To</span>
                <span className="text-white text-xs">
                  {isSnsMode && snsResolvedAddr ? (
                    <span className="text-purple-300 font-semibold">{formatShibName(toAddress)}</span>
                  ) : (
                    <span className="font-mono">{effectiveAddress.slice(0, 8)}...{effectiveAddress.slice(-6)}</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Network</span>
                <span className="text-white">{network?.name}</span>
              </div>
            </div>

            <a
              href={getExplorerTxUrl(chainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03]
                         text-white font-medium text-sm transition-all duration-300 active:scale-[0.97]
                         hover:border-[#FF6900]/30 hover:shadow-[0_0_15px_rgba(255,105,0,0.08)]
                         flex items-center justify-center gap-2 mb-3"
            >
              View on Explorer
              <ExternalLink size={14} />
            </a>
            <button
              onClick={() => { clearSelection(); navigate('/wallet'); }}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-sm transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]"
            >
              Back to Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SendNft;
