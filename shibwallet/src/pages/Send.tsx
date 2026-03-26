import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import TokenSelector from '../components/TokenSelector';
import ReviewModal from '../components/ReviewModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { getNetworkByChainId, getExplorerTxUrl } from '../lib/chains';
import { getTokensForChain, isNativeToken, type TokenInfo } from '../lib/tokens';
import { ERC20_ABI } from '../lib/abis';

const Send: React.FC = () => {
  const navigate = useNavigate();
  const { address, privateKey, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);

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
  const [estimatingGas, setEstimatingGas] = useState(false);

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
        default: { http: [network.rpcUrl] },
      },
    };
  }, [network]);

  const publicClient = useMemo(() => {
    if (!network || !viemChain) return null;
    return createPublicClient({
      chain: viemChain,
      transport: http(network.rpcUrl),
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
    if (!publicClient || !address || !toAddress || !amount || !selectedToken || !network) {
      setGasEstimate(null);
      return;
    }

    const isValidTo = toAddress.startsWith('0x') && toAddress.length === 42;
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
            to: toAddress as `0x${string}`,
            value: parsedAmount,
          });
          setGasEstimate(gas);
        } else {
          const gas = await publicClient.estimateGas({
            account: address as `0x${string}`,
            to: selectedToken.address,
            data: encodeFunctionData(toAddress as `0x${string}`, parsedAmount),
          });
          setGasEstimate(gas);
        }
      } catch {
        setGasEstimate(null);
      } finally {
        setEstimatingGas(false);
      }
    };

    const timer = setTimeout(estimate, 500);
    return () => clearTimeout(timer);
  }, [publicClient, address, toAddress, amount, selectedToken, network]);

  const isValidAddress = toAddress.startsWith('0x') && toAddress.length === 42;
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
      const walletClient = createWalletClient({
        chain: viemChain,
        transport: http(network.rpcUrl),
        account,
      });

      const parsedAmount = parseUnits(amount, selectedToken.decimals);
      let hash: `0x${string}`;

      if (isNativeToken(selectedToken)) {
        hash = await walletClient.sendTransaction({
          to: toAddress as `0x${string}`,
          value: parsedAmount,
        });
      } else {
        hash = await walletClient.writeContract({
          address: selectedToken.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [toAddress as `0x${string}`, parsedAmount],
        });
      }

      setTxHash(hash);
      setReviewOpen(false);
      toast.success('Transaction sent successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setSending(false);
    }
  }, [selectedToken, privateKey, network, viemChain, publicClient, amount, toAddress]);

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

        <h1 className="text-2xl font-bold text-white mb-6">Send</h1>

        {txHash ? (
          <div className="animate-fade-in text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Transaction Sent</h2>
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
            {/* Token selector */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1.5">Token</label>
              <button
                onClick={() => setSelectorOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-shib-surface border border-shib-border hover:border-shib-orange/50 transition-colors text-left"
              >
                {selectedToken ? (
                  <>
                    <img
                      src={selectedToken.logoUrl}
                      alt={selectedToken.symbol}
                      className="w-6 h-6 rounded-full bg-shib-surface-alt"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
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
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1.5">To Address</label>
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="0x..."
                className={`w-full px-4 py-3 rounded-lg bg-shib-surface border text-white placeholder-gray-600 focus:outline-none transition-colors text-sm font-mono ${
                  toAddress && !isValidAddress
                    ? 'border-shib-red focus:border-shib-red'
                    : 'border-shib-border focus:border-shib-orange'
                }`}
              />
              {toAddress && !isValidAddress && (
                <p className="text-xs text-shib-red mt-1">
                  Enter a valid address (0x-prefixed, 42 characters)
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-1.5">Amount</label>
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
                  className="w-full px-4 py-3 pr-16 rounded-lg bg-shib-surface border border-shib-border text-white placeholder-gray-600 focus:outline-none focus:border-shib-orange transition-colors text-sm"
                />
                <button
                  onClick={handleMaxClick}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-shib-orange font-semibold hover:text-shib-orange-hover transition-colors active:scale-95"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Gas estimate */}
            {gasEstimate !== null && (
              <div className="mb-6 px-4 py-3 rounded-lg bg-shib-surface border border-shib-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Estimated Gas</span>
                  <span className="text-white font-mono">
                    {estimatingGas ? '...' : gasEstimate.toString()} units
                  </span>
                </div>
              </div>
            )}

            {/* Send button */}
            <button
              onClick={handleReview}
              disabled={!selectedToken || !isValidAddress || !amount || parseFloat(amount) <= 0}
              className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover text-white font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Review Transaction
            </button>
          </>
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
            <span className="text-white font-mono text-xs break-all">
              {toAddress}
            </span>
          </div>
          {gasEstimate !== null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Gas Estimate</span>
              <span className="text-white font-mono">{gasEstimate.toString()} units</span>
            </div>
          )}
          <div className="border-t border-shib-border pt-3 mt-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              Please verify all details before confirming. Transactions cannot be reversed.
            </p>
          </div>
        </div>
      </ReviewModal>
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
