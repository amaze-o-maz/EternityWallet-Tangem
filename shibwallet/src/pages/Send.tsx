import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseUnits,
  formatUnits,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArrowLeft, ExternalLink, X, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import TokenSelector from '../components/TokenSelector';
import ReviewModal from '../components/ReviewModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useTransactionStore } from '../store/transactionStore';
import { isShibName, resolveShibName, formatShibName } from '../lib/sns';
import { getNetworkByChainId, getExplorerTxUrl } from '../lib/chains';
import { getTokensForChain, isNativeToken, type TokenInfo } from '../lib/tokens';
import { ERC20_ABI } from '../lib/abis';
import { fetchPrices } from '../lib/prices';

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 40%)`;
}

const Send: React.FC = () => {
  const navigate = useNavigate();
  const { address, privateKey, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);
  const addTransaction = useTransactionStore((s) => s.addTransaction);

  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [tokenImgLoaded, setTokenImgLoaded] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // SNS name resolution
  const [snsInput, setSnsInput] = useState(''); // The raw .shib name typed
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

  // Redirect guards
  useEffect(() => {
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  // Set default token
  useEffect(() => {
    const tokens = getTokensForChain(chainId);
    if (tokens.length > 0 && !selectedToken) {
      setSelectedToken(tokens[0]);
    }
  }, [chainId, selectedToken]);

  // Reset image loaded state when token changes
  useEffect(() => {
    setTokenImgLoaded(false);
  }, [selectedToken]);

  useEffect(() => {
    fetchPrices().then(setPrices).catch(() => {});
  }, []);

  // Fetch balances
  useEffect(() => {
    if (!address || !publicClient) return;

    const fetchBalances = async () => {
      setLoadingBalances(true);
      const tokens = getTokensForChain(chainId);
      const newBalances: Record<string, bigint> = {};

      const promises = tokens.map(async (token) => {
        try {
          if (isNativeToken(token)) {
            const bal = await publicClient.getBalance({
              address: address as `0x${string}`,
            });
            newBalances[token.address] = bal;
          } else {
            const bal = await publicClient.readContract({
              address: token.address,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            });
            newBalances[token.address] = bal as bigint;
          }
        } catch {
          newBalances[token.address] = 0n;
        }
      });

      await Promise.all(promises);
      setBalances(newBalances);
      setLoadingBalances(false);
    };

    fetchBalances();
  }, [address, chainId, publicClient]);

  // Estimate gas when inputs change
  useEffect(() => {
    // Use effectiveAddress (resolved SNS or raw) for gas estimation
    const gasTarget = snsResolvedAddr ?? toAddress;
    if (!publicClient || !address || !gasTarget || !amount || !selectedToken || !network) {
      setGasEstimate(null);
      return;
    }

    const isValidTo = gasTarget.startsWith('0x') && gasTarget.length === 42;
    if (!isValidTo) {
      setGasEstimate(null);
      return;
    }

    let parsedAmount: bigint;
    try {
      parsedAmount = parseUnits(amount, selectedToken.decimals);
      if (parsedAmount <= 0n) {
        setGasEstimate(null);
        return;
      }
    } catch {
      setGasEstimate(null);
      return;
    }

    const estimate = async () => {
      setEstimatingGas(true);
      try {
        if (isNativeToken(selectedToken)) {
          const gas = await publicClient.estimateGas({
            account: address as `0x${string}`,
            to: effectiveAddress as `0x${string}`,
            value: parsedAmount,
          });
          setGasEstimate(gas);
        } else {
          const gas = await publicClient.estimateGas({
            account: address as `0x${string}`,
            to: selectedToken.address,
            data: encodeFunctionData(effectiveAddress as `0x${string}`, parsedAmount),
          });
          setGasEstimate(gas);
        }
        const gp = await publicClient.getGasPrice();
        setGasPrice(gp);
      } catch {
        setGasEstimate(null);
      } finally {
        setEstimatingGas(false);
      }
    };

    const timer = setTimeout(estimate, 500);
    return () => clearTimeout(timer);
  }, [publicClient, address, toAddress, snsResolvedAddr, amount, selectedToken, network]);

  // SNS: resolve .shib names when typed
  useEffect(() => {
    setSnsResolvedAddr(null);
    setSnsError(false);
    setSnsNetworkError(false);

    if (!isShibName(toAddress)) {
      setSnsInput('');
      setSnsResolving(false);
      return;
    }

    setSnsInput(toAddress);
    setSnsResolving(true);

    const timer = setTimeout(async () => {
      try {
        const addr = await resolveShibName(toAddress, chainId);
        if (addr) {
          setSnsResolvedAddr(addr);
        } else {
          // Contract returned zero address — name is genuinely not registered
          setSnsError(true);
        }
      } catch {
        // RPC/network failure — distinct from "name not found"
        setSnsNetworkError(true);
      } finally {
        setSnsResolving(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [toAddress]);

  // The effective address used for transactions: resolved SNS address or raw input
  const effectiveAddress = snsResolvedAddr ?? toAddress;
  const isValidAddress = effectiveAddress.startsWith('0x') && effectiveAddress.length === 42;
  const isSnsMode = isShibName(toAddress);
  const currentBalance = selectedToken ? (balances[selectedToken.address] ?? 0n) : 0n;
  const formattedBalance = selectedToken
    ? formatUnits(currentBalance, selectedToken.decimals)
    : '0';

  const handleMaxClick = () => {
    if (selectedToken) {
      setAmount(formatUnits(currentBalance, selectedToken.decimals));
    }
  };

  const handleReview = () => {
    if (!selectedToken) {
      toast.error('Please select a token');
      return;
    }
    if (!isValidAddress) {
      toast.error('Please enter a valid address (0x-prefixed, 42 characters)');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    try {
      const parsedAmount = parseUnits(amount, selectedToken.decimals);
      if (parsedAmount > currentBalance) {
        toast.error('Insufficient balance');
        return;
      }
    } catch {
      toast.error('Invalid amount');
      return;
    }
    setReviewOpen(true);
  };

  const handleConfirmSend = useCallback(async () => {
    if (!selectedToken || !privateKey || !network || !viemChain || !publicClient) return;

    setSending(true);
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const sendRpcs = [network.rpcUrl, ...(network.rpcFallbacks ?? [])];
      const walletClient = createWalletClient({
        chain: viemChain,
        transport: sendRpcs.length > 1
          ? fallback(sendRpcs.map((url) => http(url, { timeout: 5_000 })))
          : http(sendRpcs[0], { timeout: 5_000 }),
        account,
      });

      const parsedAmount = parseUnits(amount, selectedToken.decimals);
      let hash: `0x${string}`;

      // Pass pre-computed gas AND gasPrice to skip both eth_estimateGas
      // and eth_gasPrice RPC calls — we already have these from the review step.
      const gasOpts: Record<string, bigint> = {};
      if (gasEstimate) gasOpts.gas = gasEstimate;
      if (gasPrice) gasOpts.gasPrice = gasPrice;

      if (isNativeToken(selectedToken)) {
        hash = await walletClient.sendTransaction({
          to: effectiveAddress as `0x${string}`,
          value: parsedAmount,
          ...gasOpts,
        });
      } else {
        hash = await walletClient.writeContract({
          address: selectedToken.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [effectiveAddress as `0x${string}`, parsedAmount],
          ...gasOpts,
        });
      }

      setTxHash(hash);
      setReviewOpen(false);
      setShowSuccessModal(true);
      setCopiedHash(false);

      // Record transaction in local store for history
      try {
        addTransaction({
          hash,
          from: address!,
          to: effectiveAddress,
          value: parseUnits(amount, selectedToken.decimals).toString(),
          timeStamp: Math.floor(Date.now() / 1000).toString(),
          type: 'send',
          chainId,
          tokenSymbol: isNativeToken(selectedToken) ? undefined : selectedToken.symbol,
          tokenDecimal: isNativeToken(selectedToken) ? undefined : selectedToken.decimals.toString(),
          tokenName: isNativeToken(selectedToken) ? undefined : selectedToken.name,
        });
      } catch {
        // Don't let history recording errors affect the success display
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setSending(false);
    }
  }, [selectedToken, privateKey, network, viemChain, publicClient, amount, toAddress, address, addTransaction, chainId]);

  const handleCopyHash = useCallback(() => {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash).then(() => {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }).catch(() => {});
  }, [txHash]);

  if (!isUnlocked || !address) return null;

  return (
    <div className="safe-top flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      {/* Subtle background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md mx-auto w-full px-5 py-8 relative z-10">
        {/* Back button */}
        <button
          onClick={() => navigate('/wallet')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-8 active:scale-95"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-bold mb-8 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
          Send
        </h1>

        {txHash ? null : (
          <div className="space-y-5">
            {/* Token selector */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Token</label>
              <button
                onClick={() => setSelectorOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl
                           bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                           hover:border-[#FF6900]/30 hover:shadow-[0_0_15px_rgba(255,105,0,0.08)]
                           transition-all duration-200 text-left"
              >
                {selectedToken ? (
                  <>
                    <div className="relative w-7 h-7 shrink-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: stringToColor(selectedToken.symbol) }}
                      >
                        {selectedToken.symbol.slice(0, 2)}
                      </div>
                      {tokenImgLoaded && (
                        <img
                          src={selectedToken.logoUrl}
                          alt={selectedToken.symbol}
                          className="w-7 h-7 rounded-full absolute inset-0"
                        />
                      )}
                      <img
                        src={selectedToken.logoUrl}
                        alt=""
                        className="hidden"
                        onLoad={() => setTokenImgLoaded(true)}
                      />
                    </div>
                    <span className="text-white text-sm font-medium">{selectedToken.symbol}</span>
                    <span className="ml-auto text-xs text-gray-500">
                      Balance: {loadingBalances ? '...' : parseFloat(formattedBalance).toFixed(6)}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-500 text-sm">Select a token</span>
                )}
              </button>
            </div>

            {/* To address */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">To Address</label>
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

              {/* SNS resolution status */}
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
                  Name not found — &quot;{formatShibName(toAddress)}&quot; is not registered
                </p>
              )}
              {isSnsMode && snsNetworkError && !snsResolving && (
                <p className="text-xs text-yellow-400 mt-1.5">
                  Could not resolve name — check your connection and try again
                </p>
              )}

              {/* Standard address validation */}
              {toAddress && !isSnsMode && !isValidAddress && (
                <p className="text-xs text-red-400 mt-1.5">
                  Enter a valid address (0x-prefixed, 42 characters) or .shib name
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Amount</label>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setAmount(val);
                    }
                  }}
                  placeholder="0.0"
                  className="w-full px-4 py-3.5 pr-20 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                             text-white placeholder-gray-600 focus:outline-none
                             focus:border-[#FF6900]/50 focus:shadow-[0_0_20px_rgba(255,105,0,0.12)]
                             transition-all duration-300 text-sm"
                />
                <button
                  onClick={handleMaxClick}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg
                             bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-[10px] font-bold text-white
                             hover:shadow-[0_0_12px_rgba(255,105,0,0.3)] transition-all duration-200 active:scale-95"
                >
                  MAX
                </button>
              </div>
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
              disabled={!selectedToken || !isValidAddress || !amount || parseFloat(amount) <= 0}
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

      {/* Token selector modal */}
      <TokenSelector
        isOpen={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={(token) => {
          setSelectedToken(token);
          setAmount('');
        }}
        balances={balances}
      />

      {/* Review modal */}
      <ReviewModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={handleConfirmSend}
        title="Review Transaction"
        confirmText={sending ? 'Sending...' : 'Confirm Send'}
        isLoading={sending}
      >
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Token</span>
            <span className="text-white font-medium">{selectedToken?.symbol}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Amount</span>
            <span className="text-white font-medium">{amount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">To</span>
            <span className="text-white text-xs break-all">
              {isSnsMode && snsResolvedAddr ? (
                <span><span className="text-purple-300 font-semibold">{formatShibName(toAddress)}</span> <span className="text-gray-500 font-mono">({effectiveAddress.slice(0, 6)}...{effectiveAddress.slice(-4)})</span></span>
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
              Please verify all details before confirming. Transactions cannot be reversed.
            </p>
          </div>
        </div>
      </ReviewModal>

      {/* Success notification modal */}
      {showSuccessModal && txHash && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in" onClick={() => navigate('/wallet')}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#111] border border-white/[0.08] rounded-t-3xl p-6 animate-slide-up-fade"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex items-center justify-end mb-2">
              <button
                onClick={() => navigate('/wallet')}
                className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Animated checkmark with green glow */}
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
              <h2 className="text-lg font-semibold text-white mb-1">Transaction Sent</h2>
              <p className="text-xs text-gray-400 mb-5">Your transaction has been submitted to the network</p>
            </div>

            {/* Transaction hash card */}
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
              <p className="text-sm text-gray-300 font-mono break-all leading-relaxed">
                {txHash}
              </p>
            </div>

            {/* Transaction details */}
            {selectedToken && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-5 space-y-2.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Amount</span>
                  <span className="text-white font-medium">{amount} {selectedToken.symbol}</span>
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
            )}

            {/* Action buttons */}
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
              onClick={() => navigate('/wallet')}
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

// Helper to encode ERC20 transfer function data manually for gas estimation
function encodeFunctionData(to: `0x${string}`, amount: bigint): `0x${string}` {
  // transfer(address,uint256) selector: 0xa9059cbb
  const selector = '0xa9059cbb';
  const paddedTo = to.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return `${selector}${paddedTo}${paddedAmount}` as `0x${string}`;
}

export default Send;
