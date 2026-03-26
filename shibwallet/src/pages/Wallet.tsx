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

const Wallet: React.FC = () => {
  const navigate = useNavigate();
  const { address, isUnlocked, lastActivity, resetLastActivity, lock } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);

  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
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
      const balancePromises = tokens.map(async (token) => {
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

      const [, fetchedPrices] = await Promise.all([
        Promise.all(balancePromises),
        fetchPrices(),
      ]);

      setBalances(newBalances);
      setPrices(fetchedPrices);
    } catch {
      // Silently fail; keep existing data
    } finally {
      setLoading(false);
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
    <div className="flex flex-col min-h-screen bg-shib-bg animate-fade-in">
      <Header />

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6">
        {/* Balance section */}
        <div className="text-center mb-6">
          {loading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner size={32} />
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-white">
                ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-500 mt-1">{network?.name ?? 'Unknown Network'}</p>
            </>
          )}
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <button
            onClick={() => navigate('/wallet/send')}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="w-12 h-12 rounded-full bg-shib-orange hover:bg-shib-orange-hover flex items-center justify-center transition active:scale-95">
              <ArrowUp size={20} className="text-white" />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-white transition-colors">Send</span>
          </button>

          <button
            onClick={() => navigate('/wallet/receive')}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="w-12 h-12 rounded-full bg-shib-orange hover:bg-shib-orange-hover flex items-center justify-center transition active:scale-95">
              <ArrowDown size={20} className="text-white" />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-white transition-colors">Receive</span>
          </button>

          <button
            onClick={() => navigate('/wallet/swap')}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="w-12 h-12 rounded-full bg-shib-orange hover:bg-shib-orange-hover flex items-center justify-center transition active:scale-95">
              <RefreshCw size={20} className="text-white" />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-white transition-colors">Swap</span>
          </button>
        </div>

        {/* Token list */}
        <div className="bg-shib-surface rounded-xl border border-shib-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-shib-border">
            <h2 className="text-sm font-semibold text-white">Tokens</h2>
            <button
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              className="text-gray-400 hover:text-white transition-colors active:scale-95"
              title="Refresh balances"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
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
