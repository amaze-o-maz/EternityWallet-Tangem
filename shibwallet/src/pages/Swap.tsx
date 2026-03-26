import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArrowLeft, ArrowDownUp, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import TokenSelector from '../components/TokenSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { getNetworkByChainId, getExplorerTxUrl } from '../lib/chains';
import { getTokensForChain, isNativeToken, type TokenInfo } from '../lib/tokens';
import { ERC20_ABI } from '../lib/abis';
import { getV1Quote, getTokenAllowance, approveToken, executeSwap } from '../lib/swap';

type SlippageOption = '0.1' | '0.5' | '1.0' | 'custom';

const SLIPPAGE_OPTIONS: { label: string; value: SlippageOption }[] = [
  { label: '0.1%', value: '0.1' },
  { label: '0.5%', value: '0.5' },
  { label: '1.0%', value: '1.0' },
  { label: 'Custom', value: 'custom' },
];

const Swap: React.FC = () => {
  const navigate = useNavigate();
  const { address, privateKey, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);

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

  const slippagePercent = useMemo(() => {
    if (slippageOption === 'custom') {
      const val = parseFloat(customSlippage);
      return isNaN(val) || val <= 0 ? 0.5 : val;
    }
    return parseFloat(slippageOption);
  }, [slippageOption, customSlippage]);

  const publicClient = useMemo(() => {
    if (!network) return null;
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
          default: { http: [network.rpcUrl] },
        },
      },
      transport: http(network.rpcUrl),
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

  const handleGetQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || !network) return;

    let parsedAmount: bigint;
    try {
      parsedAmount = parseUnits(fromAmount, fromToken.decimals);
      if (parsedAmount <= 0n) {
        toast.error('Enter an amount greater than zero');
        return;
      }
    } catch {
      toast.error('Invalid amount');
      return;
    }

    if (parsedAmount > fromBalance) {
      toast.error('Insufficient balance');
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
      toast.error(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setQuoting(false);
    }
  }, [fromToken, toToken, fromAmount, network, chainId, fromBalance]);

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

  const handleApprove = useCallback(async () => {
    if (!fromToken || !privateKey || !network) return;

    setApproving(true);
    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const parsedAmount = parseUnits(fromAmount, fromToken.decimals);

      toast.loading('Approving token...', { id: 'approve' });
      await approveToken(
        chainId,
        fromToken.address,
        network.swap.v1Router,
        parsedAmount,
        account,
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
      const hash = await executeSwap(
        chainId,
        fromToken,
        toToken,
        parsedAmount,
        minimumReceived,
        account,
      );
      setTxHash(hash);
      toast.success('Swap successful!', { id: 'swap' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Swap failed', { id: 'swap' });
    } finally {
      setSwapping(false);
    }
  }, [fromToken, toToken, privateKey, network, minimumReceived, fromAmount, chainId]);

  if (!isUnlocked || !address) return null;

  return (
    <div className="flex flex-col min-h-screen bg-shib-bg animate-fade-in">
      <div className="max-w-md mx-auto w-full px-4 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/wallet')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6 active:scale-95"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-bold text-white mb-6">Swap</h1>

        {txHash ? (
          <div className="animate-fade-in text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Swap Successful</h2>
            <p className="text-sm text-gray-400 font-mono break-all mb-4">
              {txHash}
            </p>
            <a
              href={getExplorerTxUrl(chainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-shib-orange hover:text-shib-orange-hover transition-colors"
            >
              View on Explorer
              <ExternalLink size={14} />
            </a>
            <div className="mt-6">
              <button
                onClick={() => navigate('/wallet')}
                className="w-full py-3 rounded-lg bg-shib-orange hover:bg-shib-orange-hover text-white font-semibold transition active:scale-95"
              >
                Back to Wallet
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* From token */}
            <div className="bg-shib-surface border border-shib-border rounded-xl p-4 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">From</span>
                <span className="text-xs text-gray-500">
                  Balance: {loadingBalances ? '...' : parseFloat(formattedFromBalance).toFixed(6)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectorOpen('from')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-shib-bg border border-shib-border hover:border-shib-orange/50 transition-colors shrink-0"
                >
                  {fromToken ? (
                    <>
                      <img
                        src={fromToken.logoUrl}
                        alt={fromToken.symbol}
                        className="w-5 h-5 rounded-full bg-shib-surface-alt"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <span className="text-white text-sm font-medium">{fromToken.symbol}</span>
                    </>
                  ) : (
                    <span className="text-gray-500 text-sm">Select</span>
                  )}
                </button>
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
              <div className="flex justify-end mt-1">
                <button
                  onClick={() => {
                    if (fromToken) {
                      setFromAmount(formatUnits(fromBalance, fromToken.decimals));
                      setQuoteResult(null);
                      setToAmount('');
                    }
                  }}
                  className="text-xs text-shib-orange hover:text-shib-orange-hover transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Flip button */}
            <div className="flex justify-center -my-1 relative z-10">
              <button
                onClick={handleFlipTokens}
                className="w-10 h-10 rounded-full bg-shib-surface border border-shib-border flex items-center justify-center hover:border-shib-orange/50 transition-colors active:scale-95"
              >
                <ArrowDownUp size={18} className="text-shib-orange" />
              </button>
            </div>

            {/* To token */}
            <div className="bg-shib-surface border border-shib-border rounded-xl p-4 mt-2 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">To</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectorOpen('to')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-shib-bg border border-shib-border hover:border-shib-orange/50 transition-colors shrink-0"
                >
                  {toToken ? (
                    <>
                      <img
                        src={toToken.logoUrl}
                        alt={toToken.symbol}
                        className="w-5 h-5 rounded-full bg-shib-surface-alt"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <span className="text-white text-sm font-medium">{toToken.symbol}</span>
                    </>
                  ) : (
                    <span className="text-gray-500 text-sm">Select</span>
                  )}
                </button>
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
            <div className="mb-4 relative">
              <button
                onClick={() => setSlippageDropdownOpen(!slippageDropdownOpen)}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
              >
                Slippage: {slippageOption === 'custom' ? `${customSlippage || '0.5'}%` : `${slippageOption}%`}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </button>

              {slippageDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-shib-surface border border-shib-border rounded-lg shadow-xl z-30 overflow-hidden animate-fade-in">
                  {SLIPPAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSlippageOption(opt.value);
                        if (opt.value !== 'custom') {
                          setSlippageDropdownOpen(false);
                        }
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                        slippageOption === opt.value
                          ? 'text-shib-orange bg-shib-surface-alt'
                          : 'text-white hover:bg-shib-surface-alt'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {slippageOption === 'custom' && (
                    <div className="px-4 py-2 border-t border-shib-border">
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
                        className="w-20 px-2 py-1.5 rounded bg-shib-bg border border-shib-border text-white text-sm focus:outline-none focus:border-shib-orange transition-colors"
                        autoFocus
                      />
                      <span className="text-gray-400 text-sm ml-1">%</span>
                      <button
                        onClick={() => setSlippageDropdownOpen(false)}
                        className="ml-2 text-xs text-shib-orange hover:text-shib-orange-hover"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Get Quote button */}
            {!quoteResult && (
              <button
                onClick={handleGetQuote}
                disabled={!fromToken || !toToken || !fromAmount || quoting || parseFloat(fromAmount) <= 0}
                className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover text-white font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {quoting && <LoadingSpinner size={18} />}
                {quoting ? 'Getting Quote...' : 'Get Quote'}
              </button>
            )}

            {/* Quote details */}
            {quoteResult && toToken && fromToken && (
              <div className="mb-4">
                <div className="bg-shib-surface border border-shib-border rounded-xl p-4 space-y-2.5 mb-4">
                  {exchangeRate !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Exchange Rate</span>
                      <span className="text-white">
                        1 {fromToken.symbol} = {exchangeRate.toFixed(6)} {toToken.symbol}
                      </span>
                    </div>
                  )}
                  {minimumReceived !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Minimum Received</span>
                      <span className="text-white">
                        {parseFloat(formatUnits(minimumReceived, toToken.decimals)).toFixed(6)} {toToken.symbol}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Price Impact</span>
                    <span className={quoteResult.priceImpact > 5 ? 'text-shib-red' : quoteResult.priceImpact > 2 ? 'text-yellow-400' : 'text-white'}>
                      {quoteResult.priceImpact}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Fee</span>
                    <span className="text-white">0.3%</span>
                  </div>
                </div>

                {/* Approve or Swap button */}
                {needsApproval ? (
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover text-white font-semibold transition active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {approving && <LoadingSpinner size={18} />}
                    {approving ? 'Approving...' : `Approve ${fromToken.symbol}`}
                  </button>
                ) : (
                  <button
                    onClick={handleSwap}
                    disabled={swapping}
                    className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover text-white font-semibold transition active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {swapping && <LoadingSpinner size={18} />}
                    {swapping ? 'Swapping...' : 'Swap'}
                  </button>
                )}
              </div>
            )}
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
    </div>
  );
};

export default Swap;
