import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPublicClient,
  http,
  fallback,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArrowDownUp, ExternalLink, X } from 'lucide-react';
import toast from 'react-hot-toast';
import TokenSelector from '../components/TokenSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useTransactionStore } from '../store/transactionStore';
import { getNetworkByChainId, getExplorerTxUrl } from '../lib/chains';
import { getTokensForChain, isNativeToken, type TokenInfo } from '../lib/tokens';
import { ERC20_ABI } from '../lib/abis';
import { getV1Quote, getTokenAllowance, approveToken, executeSwap } from '../lib/swap';
import { fetchPrices } from '../lib/prices';

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 40%)`;
}

/** Compact human-friendly amount:
 *  - >=1,000,000 → "1.23M"
 *  - >=1,000 → "12,345.67"
 *  - >=1 → up to 4 decimals, trailing zeros trimmed
 *  - <1 → up to 6 decimals, or "<0.000001"
 */
function formatAmount(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  if (!isFinite(n)) return typeof raw === 'string' ? raw : '0';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (abs >= 1) {
    // Up to 4 decimals, trim trailing zeros
    return parseFloat(n.toFixed(4)).toString();
  }
  if (abs < 0.000001) return n > 0 ? '<0.000001' : '>-0.000001';
  return parseFloat(n.toFixed(6)).toString();
}

const TokenButton: React.FC<{
  token: TokenInfo | null;
  onClick: () => void;
  label: string;
}> = ({ token, onClick, label }) => {
  const [imgErrored, setImgErrored] = useState(false);

  // Reset on token change so the new logo gets a fresh chance to load
  useEffect(() => {
    setImgErrored(false);
  }, [token?.address]);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                 hover:border-[#FF6900]/30 hover:shadow-[0_0_12px_rgba(255,105,0,0.08)]
                 transition-all duration-200 shrink-0"
    >
      {token ? (
        <>
          <div className="relative w-6 h-6 shrink-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ backgroundColor: stringToColor(token.symbol) }}
            >
              {token.symbol.slice(0, 2)}
            </div>
            {token.logoUrl && !imgErrored && (
              <img
                src={token.logoUrl}
                alt={token.symbol}
                className="w-6 h-6 rounded-full absolute inset-0 object-cover"
                onError={() => setImgErrored(true)}
              />
            )}
          </div>
          <span className="text-white text-sm font-medium">{token.symbol}</span>
        </>
      ) : (
        <span className="text-gray-500 text-sm">{label}</span>
      )}
    </button>
  );
};

type SlippageOption = '0.1' | '0.5' | '1.0' | 'custom';

const SLIPPAGE_OPTIONS: { label: string; value: SlippageOption }[] = [
  { label: '0.1%', value: '0.1' },
  { label: '0.5%', value: '0.5' },
  { label: '1.0%', value: '1.0' },
  { label: 'Custom', value: 'custom' },
];

/** Small token logo with colored-initial fallback (used in confirm modal) */
const TokenLogo: React.FC<{ token: TokenInfo }> = ({ token }) => {
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    setErrored(false);
  }, [token.address]);
  return (
    <div className="relative w-8 h-8 shrink-0">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
        style={{ backgroundColor: stringToColor(token.symbol) }}
      >
        {token.symbol.slice(0, 2)}
      </div>
      {token.logoUrl && !errored && (
        <img
          src={token.logoUrl}
          alt={token.symbol}
          className="w-8 h-8 rounded-full absolute inset-0 object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
};

const Swap: React.FC = () => {
  const navigate = useNavigate();
  const { address, privateKey, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);
  const addTransaction = useTransactionStore((s) => s.addTransaction);

  const network = useMemo(() => getNetworkByChainId(chainId), [chainId]);
  const tokens = useMemo(() => getTokensForChain(chainId), [chainId]);

  const [fromToken, setFromToken] = useState<TokenInfo | null>(null);
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [loadingBalances, setLoadingBalances] = useState(true);

  const [selectorOpen, setSelectorOpen] = useState<'from' | 'to' | null>(null);
  const [slippageOption, setSlippageOption] = useState<SlippageOption>('0.5');
  const [customSlippage, setCustomSlippage] = useState('');
  const [slippageDropdownOpen, setSlippageDropdownOpen] = useState(false);

  const [quoting, setQuoting] = useState(false);
  const [quoteResult, setQuoteResult] = useState<{
    amountOut: bigint;
    priceImpact: number;
    path: `0x${string}`[];
  } | null>(null);

  const [approving, setApproving] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedGasCost, setEstimatedGasCost] = useState<string | null>(null);
  const [estimatedGasUsd, setEstimatedGasUsd] = useState<string | null>(null);
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slippagePercent = useMemo(() => {
    if (slippageOption === 'custom') {
      const val = parseFloat(customSlippage);
      return isNaN(val) || val <= 0 ? 0.5 : val;
    }
    return parseFloat(slippageOption);
  }, [slippageOption, customSlippage]);

  const publicClient = useMemo(() => {
    if (!network) return null;
    const allRpcs = [network.rpcUrl, ...(network.rpcFallbacks ?? [])];
    return createPublicClient({
      chain: {
        id: network.chainId,
        name: network.name,
        nativeCurrency: {
          name: network.nativeToken.symbol,
          symbol: network.nativeToken.symbol,
          decimals: 18,
        },
        rpcUrls: {
          default: { http: allRpcs },
        },
      },
      transport: allRpcs.length > 1
        ? fallback(allRpcs.map((url) => http(url, { timeout: 5_000 })))
        : http(allRpcs[0], { timeout: 5_000 }),
    });
  }, [network]);

  // Redirect guard
  useEffect(() => {
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  // Set default tokens
  useEffect(() => {
    if (tokens.length >= 2) {
      if (!fromToken) setFromToken(tokens[0]);
      if (!toToken) setToToken(tokens[1]);
    } else if (tokens.length === 1) {
      if (!fromToken) setFromToken(tokens[0]);
    }
  }, [tokens, fromToken, toToken]);

  // Fetch balances
  useEffect(() => {
    if (!address || !publicClient) return;

    const fetchBalances = async () => {
      setLoadingBalances(true);
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
  }, [address, tokens, publicClient]);

  // Check allowance when quote is available
  useEffect(() => {
    if (!fromToken || !address || !network || !quoteResult || isNativeToken(fromToken)) {
      setNeedsApproval(false);
      return;
    }

    const checkAllowance = async () => {
      try {
        const allowance = await getTokenAllowance(
          chainId,
          fromToken.address,
          address as `0x${string}`,
          network.swap.v1Router,
        );
        const parsedAmount = parseUnits(fromAmount, fromToken.decimals);
        setNeedsApproval(allowance < parsedAmount);
      } catch {
        setNeedsApproval(false);
      }
    };

    checkAllowance();
  }, [fromToken, address, network, quoteResult, fromAmount, chainId]);

  useEffect(() => {
    if (!showConfirm || !quoteResult || !publicClient || !network || !fromToken || !fromAmount) {
      setEstimatedGasCost(null);
      setEstimatedGasUsd(null);
      return;
    }

    const estimateSwapGas = async () => {
      try {
        const gasPrice = await publicClient.getGasPrice();
        // Use 300k as rough estimate for swap gas units
        const gasUnits = 300_000n;
        const gasCostWei = gasUnits * gasPrice;
        const gasCostFormatted = parseFloat(formatUnits(gasCostWei, 18)).toFixed(8);
        setEstimatedGasCost(`${gasCostFormatted} ${network.nativeToken.symbol}`);

        const prices = await fetchPrices();
        const nativePrice = prices[network.nativeToken.symbol] ?? 0;
        if (nativePrice > 0) {
          const usd = parseFloat(formatUnits(gasCostWei, 18)) * nativePrice;
          setEstimatedGasUsd(usd < 0.01 ? '<$0.01' : `~$${usd.toFixed(2)}`);
        }
      } catch {
        setEstimatedGasCost(null);
        setEstimatedGasUsd(null);
      }
    };

    estimateSwapGas();
  }, [showConfirm, quoteResult, publicClient, network, fromToken, fromAmount]);

  const fromBalance = fromToken ? (balances[fromToken.address] ?? 0n) : 0n;
  const formattedFromBalance = fromToken
    ? formatUnits(fromBalance, fromToken.decimals)
    : '0';

  const handleFlipTokens = () => {
    const prev = fromToken;
    setFromToken(toToken);
    setToToken(prev);
    setFromAmount('');
    setToAmount('');
    setQuoteResult(null);
  };

  const fetchQuote = useCallback(async (silent = false) => {
    if (!fromToken || !toToken || !fromAmount || !network) return;

    let parsedAmount: bigint;
    try {
      parsedAmount = parseUnits(fromAmount, fromToken.decimals);
      if (parsedAmount <= 0n) return;
    } catch {
      return;
    }

    if (parsedAmount > fromBalance) {
      if (!silent) toast.error('Insufficient balance');
      return;
    }

    setQuoting(true);
    setQuoteResult(null);
    setToAmount('');

    try {
      const result = await getV1Quote(chainId, fromToken, toToken, parsedAmount);
      setQuoteResult(result);
      setToAmount(formatUnits(result.amountOut, toToken.decimals));
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setQuoting(false);
    }
  }, [fromToken, toToken, fromAmount, network, chainId, fromBalance]);

  // Auto-quote with 600ms debounce when amount or tokens change
  useEffect(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    setQuoteResult(null);
    setToAmount('');

    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) return;

    quoteTimerRef.current = setTimeout(() => {
      fetchQuote(true);
    }, 600);

    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [fromAmount, fromToken?.address, toToken?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const minimumReceived = useMemo(() => {
    if (!quoteResult || !toToken) return null;
    const amountOut = quoteResult.amountOut;
    const slippageBps = BigInt(Math.round(slippagePercent * 100));
    const minOut = amountOut - (amountOut * slippageBps) / 10000n;
    return minOut;
  }, [quoteResult, toToken, slippagePercent]);

  const exchangeRate = useMemo(() => {
    if (!quoteResult || !fromToken || !toToken || !fromAmount) return null;
    try {
      const inNum = parseFloat(fromAmount);
      const outNum = parseFloat(formatUnits(quoteResult.amountOut, toToken.decimals));
      if (inNum === 0) return null;
      return outNum / inNum;
    } catch {
      return null;
    }
  }, [quoteResult, fromToken, toToken, fromAmount]);

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
      ),
    ]);
  };

  const handleApprove = useCallback(async () => {
    if (!fromToken || !privateKey || !network) return;

    setApproving(true);
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const parsedAmount = parseUnits(fromAmount, fromToken.decimals);

      toast.loading('Approving token...', { id: 'approve' });
      await withTimeout(
        approveToken(chainId, fromToken.address, network.swap.v1Router, parsedAmount, account),
        60_000,
        'Approval',
      );
      toast.success('Token approved!', { id: 'approve' });
      setNeedsApproval(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed', { id: 'approve' });
    } finally {
      setApproving(false);
    }
  }, [fromToken, privateKey, network, fromAmount, chainId]);

  const handleSwap = useCallback(async () => {
    if (!fromToken || !toToken || !privateKey || !network || !minimumReceived) return;

    setSwapping(true);
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const parsedAmount = parseUnits(fromAmount, fromToken.decimals);

      toast.loading('Swapping tokens...', { id: 'swap' });
      const hash = await withTimeout(
        executeSwap(chainId, fromToken, toToken, parsedAmount, minimumReceived, account),
        60_000,
        'Swap',
      );

      // Swap was submitted successfully — show success toast immediately
      // before any state updates that could trigger re-renders
      toast.dismiss('swap');
      toast.success('Swap successful!');
      setTxHash(hash);

      // Record swap transaction in local store for history (non-critical)
      try {
        addTransaction({
          hash,
          from: address!,
          to: network.swap.v1Router,
          value: parsedAmount.toString(),
          timeStamp: Math.floor(Date.now() / 1000).toString(),
          type: 'swap',
          chainId,
          fromTokenSymbol: fromToken.symbol,
          toTokenSymbol: toToken.symbol,
          tokenSymbol: fromToken.symbol,
          tokenDecimal: fromToken.decimals.toString(),
          toAmount: quoteResult?.amountOut?.toString(),
        });
      } catch {
        // Don't let history recording errors affect the swap result
      }
    } catch (err) {
      toast.dismiss('swap');
      toast.error(err instanceof Error ? err.message : 'Swap failed');
    } finally {
      setSwapping(false);
    }
  }, [fromToken, toToken, privateKey, network, minimumReceived, fromAmount, chainId, address, addTransaction, quoteResult]);

  if (!isUnlocked || !address) return null;

  return (
    <>
      <div className="max-w-md mx-auto w-full px-5 pt-6 pb-40">
        {/* ShibaSwap branding */}
        <div className="flex items-center gap-3 mb-8">
          <img
            src="https://assets.coingecko.com/coins/images/11939/standard/shiba.png"
            alt="ShibaSwap"
            className="w-9 h-9 rounded-full"
          />
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent leading-tight">
              ShibaSwap
            </h1>
            <p className="text-[11px] text-gray-500 mt-0.5">Powered by ShibaSwap DEX</p>
          </div>
        </div>

        {txHash ? (
          <div className="animate-slide-up-fade text-center py-8">
            {/* Animated checkmark with green glow */}
            <div className="relative inline-block mb-6">
              <div
                className="absolute inset-0"
                style={{
                  background: 'radial-gradient(circle, rgba(34, 197, 94, 0.2) 0%, transparent 70%)',
                  transform: 'scale(2.5)',
                  filter: 'blur(20px)',
                }}
              />
              <div className="relative w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto backdrop-blur-xl">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">Swap Successful</h2>

            {/* Glass-card tx hash */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 mb-6">
              <p className="text-xs text-gray-500 mb-1.5">Transaction Hash</p>
              <p className="text-sm text-gray-300 font-mono break-all leading-relaxed">
                {txHash}
              </p>
            </div>

            <button
              onClick={() => navigate(`/wallet/browser?url=${encodeURIComponent(getExplorerTxUrl(chainId, txHash))}`)}
              className="inline-flex items-center gap-1.5 text-sm text-[#FF6900] hover:text-[#FFB800] transition-colors mb-6"
            >
              View on Explorer
              <ExternalLink size={14} />
            </button>
            <div>
              <button
                onClick={() => navigate('/wallet')}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                           text-white font-semibold transition-all duration-300 active:scale-[0.97]
                           hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]"
              >
                Back to Wallet
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* From token card */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 mb-2 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 font-medium">From</span>
                <span className="text-xs text-gray-500">
                  Balance: {loadingBalances ? '...' : parseFloat(formattedFromBalance).toFixed(6)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <TokenButton
                  token={fromToken}
                  onClick={() => setSelectorOpen('from')}
                  label="Select"
                />
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setFromAmount(val);
                      setQuoteResult(null);
                      setToAmount('');
                    }
                  }}
                  placeholder="0.0"
                  className="flex-1 bg-transparent text-white text-right text-lg font-medium placeholder-gray-600 focus:outline-none min-w-0"
                />
              </div>
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => {
                    if (fromToken) {
                      setFromAmount(formatUnits(fromBalance, fromToken.decimals));
                      setQuoteResult(null);
                      setToAmount('');
                    }
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-bold
                             bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-white
                             hover:shadow-[0_0_10px_rgba(255,105,0,0.3)] transition-all duration-200 active:scale-95"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Flip button */}
            <div className="flex justify-center -my-2 relative z-10">
              <button
                onClick={handleFlipTokens}
                className="w-12 h-12 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                           flex items-center justify-center transition-all duration-300 active:scale-95
                           hover:border-[#FF6900]/40 hover:shadow-[0_0_20px_rgba(255,105,0,0.15)]
                           hover:bg-white/[0.06]"
              >
                <ArrowDownUp size={20} className="text-[#FF6900]" />
              </button>
            </div>

            {/* To token card */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 mt-2 mb-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 font-medium">To</span>
              </div>
              <div className="flex items-center gap-3">
                <TokenButton
                  token={toToken}
                  onClick={() => setSelectorOpen('to')}
                  label="Select"
                />
                <input
                  type="text"
                  value={quoting ? '' : toAmount}
                  readOnly
                  placeholder={quoting ? 'Quoting...' : '0.0'}
                  className="flex-1 bg-transparent text-white text-right text-lg font-medium placeholder-gray-600 focus:outline-none min-w-0 cursor-default"
                />
              </div>
              {quoting && (
                <div className="flex justify-end mt-2">
                  <LoadingSpinner size={16} />
                </div>
              )}
            </div>

            {/* Slippage */}
            <div className="mb-5 relative">
              <button
                onClick={() => setSlippageDropdownOpen(!slippageDropdownOpen)}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors
                           px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]"
              >
                Slippage: {slippageOption === 'custom' ? `${customSlippage || '0.5'}%` : `${slippageOption}%`}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </button>

              {slippageDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                                rounded-xl shadow-2xl z-30 overflow-hidden animate-slide-up-fade">
                  {SLIPPAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSlippageOption(opt.value);
                        if (opt.value !== 'custom') {
                          setSlippageDropdownOpen(false);
                        }
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-all duration-200 ${
                        slippageOption === opt.value
                          ? 'text-[#FF6900] bg-white/[0.04]'
                          : 'text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {slippageOption === 'custom' && (
                    <div className="px-4 py-2.5 border-t border-white/[0.06]">
                      <input
                        type="text"
                        value={customSlippage}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setCustomSlippage(val);
                          }
                        }}
                        placeholder="0.5"
                        className="w-20 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]
                                   text-white text-sm focus:outline-none focus:border-[#FF6900]/50 transition-all duration-200"
                        autoFocus
                      />
                      <span className="text-gray-400 text-sm ml-1">%</span>
                      <button
                        onClick={() => setSlippageDropdownOpen(false)}
                        className="ml-2 text-xs text-[#FF6900] hover:text-[#FFB800] transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quote details */}
            {quoteResult && toToken && fromToken && (
              <div className="mb-4 animate-slide-up-fade">
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 space-y-3 mb-5 shadow-2xl">
                  {exchangeRate !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Exchange Rate</span>
                      <span className="text-white font-medium">
                        1 {fromToken.symbol} = {exchangeRate.toFixed(6)} {toToken.symbol}
                      </span>
                    </div>
                  )}
                  {minimumReceived !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Minimum Received</span>
                      <span className="text-white font-medium">
                        {parseFloat(formatUnits(minimumReceived, toToken.decimals)).toFixed(6)} {toToken.symbol}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Price Impact</span>
                    <span className={quoteResult.priceImpact > 5 ? 'text-red-400' : quoteResult.priceImpact > 2 ? 'text-yellow-400' : 'text-white'}>
                      {quoteResult.priceImpact}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Fee</span>
                    <span className="text-white">0.3%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Swap button — opens confirmation modal */}
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!quoteResult || quoting || !fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none
                         flex items-center justify-center gap-2"
            >
              {quoting && <LoadingSpinner size={18} />}
              {quoting ? 'Getting Quote...' : quoteResult ? 'Review Swap' : 'Enter an amount'}
            </button>
          </>
        )}
      </div>

      {/* Token selector modals */}
      <TokenSelector
        isOpen={selectorOpen === 'from'}
        onClose={() => setSelectorOpen(null)}
        onSelect={(token) => {
          if (toToken && token.address === toToken.address) {
            handleFlipTokens();
          } else {
            setFromToken(token);
            setQuoteResult(null);
            setToAmount('');
          }
        }}
        balances={balances}
      />
      <TokenSelector
        isOpen={selectorOpen === 'to'}
        onClose={() => setSelectorOpen(null)}
        onSelect={(token) => {
          if (fromToken && token.address === fromToken.address) {
            handleFlipTokens();
          } else {
            setToToken(token);
            setQuoteResult(null);
            setToAmount('');
          }
        }}
        balances={balances}
      />

      {/* Confirmation Modal */}
      {showConfirm && quoteResult && fromToken && toToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in px-4" onClick={() => !approving && !swapping && setShowConfirm(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md max-h-[80vh] bg-[#111] border border-white/[0.08] rounded-2xl flex flex-col animate-slide-up-fade shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6 pb-0">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Confirm Swap</h2>
                <button
                  onClick={() => !approving && !swapping && setShowConfirm(false)}
                  className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* From → To summary */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0 shrink-0">
                    <TokenLogo token={fromToken} />
                    <span className="text-white text-sm font-medium">{fromToken.symbol}</span>
                  </div>
                  <span
                    className="text-white text-base font-semibold text-right tabular-nums min-w-0 truncate"
                    title={fromAmount}
                  >
                    {formatAmount(fromAmount)}
                  </span>
                </div>
                <div className="flex justify-center my-1">
                  <ArrowDownUp size={16} className="text-gray-500" />
                </div>
                <div className="flex items-center justify-between gap-3 mt-3">
                  <div className="flex items-center gap-2 min-w-0 shrink-0">
                    <TokenLogo token={toToken} />
                    <span className="text-white text-sm font-medium">{toToken.symbol}</span>
                  </div>
                  <span
                    className="text-white text-base font-semibold text-right tabular-nums min-w-0 truncate"
                    title={toAmount}
                  >
                    {formatAmount(toAmount)}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4 space-y-2.5">
                {exchangeRate !== null && (
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-gray-400 shrink-0">Rate</span>
                    <span className="text-white text-right truncate tabular-nums" title={`1 ${fromToken.symbol} = ${exchangeRate} ${toToken.symbol}`}>
                      1 {fromToken.symbol} = {formatAmount(exchangeRate)} {toToken.symbol}
                    </span>
                  </div>
                )}
                {minimumReceived !== null && (
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-gray-400 shrink-0">Min. Received</span>
                    <span className="text-white text-right truncate tabular-nums" title={formatUnits(minimumReceived, toToken.decimals)}>
                      {formatAmount(formatUnits(minimumReceived, toToken.decimals))} {toToken.symbol}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Price Impact</span>
                  <span className={quoteResult.priceImpact > 5 ? 'text-red-400' : quoteResult.priceImpact > 2 ? 'text-yellow-400' : 'text-white'}>
                    {quoteResult.priceImpact}%
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Slippage</span>
                  <span className="text-white">{slippagePercent}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Fee</span>
                  <span className="text-white">0.3%</span>
                </div>
                {estimatedGasCost && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Est. Gas Fee</span>
                    <div className="text-right">
                      <span className="text-white">{estimatedGasCost}</span>
                      {estimatedGasUsd && (
                        <span className="text-gray-500 ml-1">({estimatedGasUsd})</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {quoteResult.priceImpact > 5 && (
                <p className="text-red-400 text-xs text-center mb-2">
                  Warning: High price impact! You may receive significantly less than expected.
                </p>
              )}
            </div>

            {/* Fixed action button — always visible at the bottom */}
            <div className="p-6 pt-2">
              {needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                             text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                             hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]
                             disabled:opacity-70 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                >
                  {approving && <LoadingSpinner size={18} />}
                  {approving ? 'Approving...' : `Approve ${fromToken.symbol}`}
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await handleSwap();
                    setShowConfirm(false);
                  }}
                  disabled={swapping}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                             text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                             hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]
                             disabled:opacity-70 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2"
                >
                  {swapping && <LoadingSpinner size={18} />}
                  {swapping ? 'Swapping...' : 'Confirm Swap'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Swap;
