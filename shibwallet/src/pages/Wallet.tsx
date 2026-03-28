import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPublicClient, http, formatUnits } from 'viem';
import { ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import TokenList from '../components/TokenList';
import LoadingSpinner from '../components/LoadingSpinner';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { getNetworkByChainId } from '../lib/chains';
import { getTokensForChain, isNativeToken } from '../lib/tokens';
import { ERC20_ABI } from '../lib/abis';
import { fetchPrices } from '../lib/prices';

const VAULT_KEY = 'shibwallet_vault';
const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes

const SkeletonRow: React.FC<{ index: number }> = ({ index }) => (
  <div
    className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05] last:border-b-0"
    style={{ animation: `slide-up-fade 0.4s ease-out ${index * 50}ms both` }}
  >
    <div className="w-10 h-10 rounded-full bg-white/[0.06] animate-shimmer" />
    <div className="flex-1 space-y-2">
      <div className="h-3.5 w-24 rounded bg-white/[0.06] animate-shimmer" />
      <div className="h-3 w-16 rounded bg-white/[0.04] animate-shimmer" />
    </div>
    <div className="space-y-2 text-right">
      <div className="h-3.5 w-20 rounded bg-white/[0.06] animate-shimmer ml-auto" />
      <div className="h-3 w-14 rounded bg-white/[0.04] animate-shimmer ml-auto" />
    </div>
  </div>
);

const Wallet: React.FC = () => {
  const navigate = useNavigate();
  const { address, isUnlocked, lastActivity, resetLastActivity, lock } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);

  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lockCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect guards
  useEffect(() => {
    if (!localStorage.getItem(VAULT_KEY)) {
      navigate('/', { replace: true });
      return;
    }
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  // Auto-lock check
  useEffect(() => {
    lockCheckRef.current = setInterval(() => {
      const elapsed = Date.now() - useWalletStore.getState().lastActivity;
      if (elapsed > AUTO_LOCK_MS) {
        lock();
        navigate('/lock', { replace: true });
      }
    }, 10_000);

    return () => {
      if (lockCheckRef.current) clearInterval(lockCheckRef.current);
    };
  }, [lock, navigate]);

  // Reset activity on user interaction
  useEffect(() => {
    const handler = () => resetLastActivity();
    window.addEventListener('click', handler);
    window.addEventListener('keypress', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keypress', handler);
    };
  }, [resetLastActivity]);

  // Fetch balances and prices
  const fetchData = useCallback(async () => {
    if (!address) return;

    const network = getNetworkByChainId(chainId);
    if (!network) return;

    const chain = {
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
    } as const;

    const publicClient = createPublicClient({
      chain,
      transport: http(network.rpcUrl),
    });

    const tokens = getTokensForChain(chainId);
    const newBalances: Record<string, bigint> = {};

    try {
      const nativeTokens = tokens.filter(isNativeToken);
      const erc20Tokens = tokens.filter((t) => !isNativeToken(t));

      // Fetch native balance + all ERC20 balances via multicall + prices in parallel
      const nativePromise = nativeTokens.length > 0
        ? publicClient.getBalance({ address: address as `0x${string}` })
        : Promise.resolve(0n);

      const multicallPromise = erc20Tokens.length > 0
        ? publicClient.multicall({
            contracts: erc20Tokens.map((token) => ({
              address: token.address,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            })),
          })
        : Promise.resolve([]);

      const [nativeBal, multicallResults, fetchedPrices] = await Promise.all([
        nativePromise,
        multicallPromise,
        fetchPrices(),
      ]);

      // Set native balances
      for (const token of nativeTokens) {
        newBalances[token.address] = nativeBal;
      }

      // Set ERC20 balances from multicall
      erc20Tokens.forEach((token, i) => {
        const result = multicallResults[i];
        newBalances[token.address] = result.status === 'success' ? BigInt(result.result as unknown as string) : 0n;
      });

      setBalances(newBalances);
      setPrices(fetchedPrices);
    } catch {
      // Silently fail; keep existing data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Calculate total USD value
  const totalUsd = (() => {
    const tokens = getTokensForChain(chainId);
    let total = 0;
    for (const token of tokens) {
      const raw = balances[token.address] ?? 0n;
      if (raw === 0n) continue;
      const price = prices[token.symbol] ?? 0;
      if (price === 0) continue;
      const numeric = parseFloat(formatUnits(raw, token.decimals));
      total += numeric * price;
    }
    return total;
  })();

  const network = getNetworkByChainId(chainId);

  if (!isUnlocked || !address) return null;

  return (
    <div className="flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      {/* Subtle background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <Header />

      <main className="flex-1 max-w-md mx-auto w-full px-5 py-8 relative z-10">
        {/* Balance section */}
        <div className="text-center mb-8">
          {loading ? (
            <div className="py-4 space-y-3">
              <div className="h-10 w-48 rounded-lg bg-white/[0.06] animate-shimmer mx-auto" />
              <div className="h-5 w-28 rounded bg-white/[0.04] animate-shimmer mx-auto" />
            </div>
          ) : (
            <>
              <div className="relative inline-block">
                {/* Glow behind balance */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, rgba(255, 105, 0, 0.12) 0%, transparent 70%)',
                    transform: 'scale(2)',
                    filter: 'blur(25px)',
                  }}
                />
                <p className="relative text-5xl font-bold bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent leading-tight py-1">
                  ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]">
                <span className="text-xs text-gray-400 font-medium">{network?.name ?? 'Unknown Network'}</span>
              </div>
            </>
          )}
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center justify-center gap-6 mb-10">
          <button
            onClick={() => navigate('/wallet/send')}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-r from-[#FF6900] to-[#FF8C00] flex items-center justify-center
                            transition-all duration-300 active:scale-95
                            hover:shadow-[0_0_25px_rgba(255,105,0,0.3)] group-hover:scale-105">
              <ArrowUp size={22} className="text-white" />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-white transition-colors font-medium">Send</span>
          </button>

          <button
            onClick={() => navigate('/wallet/receive')}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-r from-[#FF6900] to-[#FF8C00] flex items-center justify-center
                            transition-all duration-300 active:scale-95
                            hover:shadow-[0_0_25px_rgba(255,105,0,0.3)] group-hover:scale-105">
              <ArrowDown size={22} className="text-white" />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-white transition-colors font-medium">Receive</span>
          </button>

          <button
            onClick={() => navigate('/wallet/swap')}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-r from-[#FF6900] to-[#FF8C00] flex items-center justify-center
                            transition-all duration-300 active:scale-95
                            hover:shadow-[0_0_25px_rgba(255,105,0,0.3)] group-hover:scale-105">
              <RefreshCw size={22} className="text-white" />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-white transition-colors font-medium">Swap</span>
          </button>
        </div>

        {/* Token list */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
              Tokens
            </h2>
            <button
              onClick={() => {
                setRefreshing(true);
                setLoading(true);
                fetchData();
              }}
              className="text-gray-400 hover:text-white transition-all duration-300 active:scale-95 p-1.5 rounded-lg hover:bg-white/[0.06]"
              title="Refresh balances"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin-slow' : ''} />
            </button>
          </div>
          {loading ? (
            <div>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonRow key={i} index={i} />
              ))}
            </div>
          ) : (
            <TokenList balances={balances} prices={prices} />
          )}
        </div>
      </main>
    </div>
  );
};

export default Wallet;
