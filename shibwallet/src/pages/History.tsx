import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUnits } from 'viem';
import { ArrowUpRight, ArrowDownLeft, ArrowDownUp, RefreshCw, ExternalLink } from 'lucide-react';
import ShibName from '../components/ShibName';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useTransactionStore, type StoredTransaction } from '../store/transactionStore';
import { getNetworkByChainId } from '../lib/chains';

// ── localStorage cache so the History page is instant on re-open ─────
const HISTORY_CACHE_KEY = 'shibwallet_history_cache';
const HISTORY_CACHE_TTL_MS = 60 * 1000; // 1 min — revalidate in background

interface HistoryCacheEntry {
  txList: Transaction[];
  tokenTxList: Transaction[];
  at: number;
}

function historyCacheRead(
  address: string,
  chainId: number,
): HistoryCacheEntry | null {
  try {
    const raw = localStorage.getItem(HISTORY_CACHE_KEY);
    if (!raw) return null;
    const all: Record<string, HistoryCacheEntry> = JSON.parse(raw);
    const key = `${chainId}:${address.toLowerCase()}`;
    return all[key] ?? null;
  } catch {
    return null;
  }
}

function historyCacheWrite(
  address: string,
  chainId: number,
  txList: Transaction[],
  tokenTxList: Transaction[],
) {
  try {
    const raw = localStorage.getItem(HISTORY_CACHE_KEY);
    const all: Record<string, HistoryCacheEntry> = raw ? JSON.parse(raw) : {};
    const key = `${chainId}:${address.toLowerCase()}`;
    all[key] = { txList, tokenTxList, at: Date.now() };
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(all));
  } catch {
    /* quota — ignore */
  }
}

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError: string;
  gasUsed: string;
  gasPrice: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  tokenName?: string;
  // Local transaction fields
  type?: 'send' | 'swap' | 'send-nft';
  fromTokenSymbol?: string;
  toTokenSymbol?: string;
  toAmount?: string;
  isLocal?: boolean;
  // NFT send fields
  nftContract?: string;
  nftTokenIds?: string[];
  nftStandard?: string;
  nftTotalQuantity?: number;
  nftCollectionName?: string;
  nftImageUrl?: string;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function truncateAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getExplorerApiUrl(chainId: number): string {
  if (chainId === 1) return 'https://eth.blockscout.com/api';
  if (chainId === 109) return 'https://shibariumscan.io/api';
  return 'https://eth.blockscout.com/api';
}

function getExplorerTxUrl(chainId: number, hash: string): string {
  if (chainId === 1) return `https://etherscan.io/tx/${hash}`;
  if (chainId === 109) return `https://shibariumscan.io/tx/${hash}`;
  return `https://etherscan.io/tx/${hash}`;
}

const SkeletonRow: React.FC<{ index: number }> = ({ index }) => (
  <div
    className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05] last:border-b-0"
    style={{ animation: `slide-up-fade 0.4s ease-out ${index * 50}ms both` }}
  >
    <div className="w-10 h-10 rounded-full bg-white/[0.06] animate-shimmer" />
    <div className="flex-1 space-y-2">
      <div className="h-3.5 w-28 rounded bg-white/[0.06] animate-shimmer" />
      <div className="h-3 w-20 rounded bg-white/[0.04] animate-shimmer" />
    </div>
    <div className="space-y-2 text-right">
      <div className="h-3.5 w-20 rounded bg-white/[0.06] animate-shimmer ml-auto" />
      <div className="h-3 w-14 rounded bg-white/[0.04] animate-shimmer ml-auto" />
    </div>
  </div>
);

type TabType = 'all' | 'tokens';

const History: React.FC = () => {
  const navigate = useNavigate();
  const { address, isUnlocked } = useWalletStore();
  const chainId = useNetworkStore((s) => s.chainId);
  const network = getNetworkByChainId(chainId);
  const localTransactions = useTransactionStore((s) => s.getTransactionsForChain(chainId));

  // Hydrate synchronously from localStorage so switching to History shows
  // the last-seen list instantly instead of flashing skeletons for 3-5s.
  // Keyed by `${chainId}:${address}` so multiple chains/accounts each get
  // their own cache bucket.
  const initialCache = useMemo(() => {
    if (!address) return null;
    return historyCacheRead(address, chainId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId]);

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [txList, setTxList] = useState<Transaction[]>(initialCache?.txList ?? []);
  const [tokenTxList, setTokenTxList] = useState<Transaction[]>(
    initialCache?.tokenTxList ?? [],
  );
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAtRef = useRef<number>(initialCache?.at ?? 0);

  useEffect(() => {
    if (!localStorage.getItem('shibwallet_vault')) {
      navigate('/', { replace: true });
      return;
    }
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  const fetchTransactions = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!address) return;

      // Only show a skeleton when we don't already have cached data.
      if (!opts.silent) setLoading(true);
      setError(null);
      const apiUrl = getExplorerApiUrl(chainId);
      const addr = address.toLowerCase();

      try {
        const [txRes, tokenRes] = await Promise.all([
          fetch(
            `${apiUrl}?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`,
          ).then((r) => r.json()),
          fetch(
            `${apiUrl}?module=account&action=tokentx&address=${addr}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`,
          ).then((r) => r.json()),
        ]);

        const nextTx: Transaction[] =
          txRes.status === '1' && Array.isArray(txRes.result) ? txRes.result : [];
        const nextToken: Transaction[] =
          tokenRes.status === '1' && Array.isArray(tokenRes.result) ? tokenRes.result : [];

        setTxList(nextTx);
        setTokenTxList(nextToken);
        historyCacheWrite(address, chainId, nextTx, nextToken);
        lastFetchedAtRef.current = Date.now();
      } catch (err) {
        console.error('[ShibWallet] Failed to fetch transaction history:', err);
        // Only surface an error if we have nothing cached to show. Silent
        // revalidation failures should keep stale data visible rather than
        // blow it away with an error screen.
        const localTxs = useTransactionStore.getState().transactions.filter(
          (t) => t.chainId === chainId,
        );
        // Note: using state snapshot via closure is fine here — we just
        // want to know if there's anything on-screen.
        if (localTxs.length === 0 && txList.length === 0 && tokenTxList.length === 0) {
          setError('Failed to load transactions. Please try again.');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
      // txList/tokenTxList intentionally excluded — we only read them to
      // decide error handling, not to trigger re-runs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [address, chainId],
  );

  // On mount or chain/address change: hydrate from cache and refetch only
  // if the cache is stale (or missing). New chain/address → reset state.
  useEffect(() => {
    if (!address) return;
    const cached = historyCacheRead(address, chainId);
    if (cached) {
      setTxList(cached.txList);
      setTokenTxList(cached.tokenTxList);
      lastFetchedAtRef.current = cached.at;
      // Fresh cache? skip the fetch entirely.
      if (Date.now() - cached.at < HISTORY_CACHE_TTL_MS) {
        setLoading(false);
        return;
      }
      // Stale: silently revalidate in the background.
      fetchTransactions({ silent: true });
    } else {
      // No cache: loud fetch with skeleton.
      setTxList([]);
      setTokenTxList([]);
      lastFetchedAtRef.current = 0;
      fetchTransactions();
    }
    // Revalidate on app resume so stale data doesn't linger after the
    // WebView was paused. `fetchTransactions` is silent when we already
    // have items displayed.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const age = Date.now() - lastFetchedAtRef.current;
      if (age > HISTORY_CACHE_TTL_MS) {
        fetchTransactions({ silent: txList.length > 0 || tokenTxList.length > 0 });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, fetchTransactions]);

  const handleRefresh = () => {
    setRefreshing(true);
    // Force a loud refetch (ignores cache TTL, shows skeleton only if
    // there's nothing to display — otherwise just the spinning icon).
    const hasItems = txList.length > 0 || tokenTxList.length > 0;
    fetchTransactions({ silent: hasItems });
  };

  // Convert local transactions to the Transaction interface and merge with API results
  const localTxsMapped: Transaction[] = localTransactions.map((lt) => ({
    hash: lt.hash,
    from: lt.from,
    to: lt.to,
    value: lt.value,
    timeStamp: lt.timeStamp,
    isError: '0',
    gasUsed: '0',
    gasPrice: '0',
    tokenSymbol: lt.tokenSymbol,
    tokenDecimal: lt.tokenDecimal,
    tokenName: lt.tokenName,
    type: lt.type,
    fromTokenSymbol: lt.fromTokenSymbol,
    toTokenSymbol: lt.toTokenSymbol,
    toAmount: lt.toAmount,
    nftContract: lt.nftContract,
    nftTokenIds: lt.nftTokenIds,
    nftStandard: lt.nftStandard,
    nftTotalQuantity: lt.nftTotalQuantity,
    nftCollectionName: lt.nftCollectionName,
    nftImageUrl: lt.nftImageUrl,
    isLocal: true,
  }));

  const mergeWithLocal = (apiTxs: Transaction[]): Transaction[] => {
    const apiHashes = new Set(apiTxs.map((tx) => tx.hash.toLowerCase()));
    // Add local transactions that aren't already in the API results
    const uniqueLocal = localTxsMapped.filter(
      (lt) => !apiHashes.has(lt.hash.toLowerCase()),
    );
    const merged = [...uniqueLocal, ...apiTxs];
    // Sort by timestamp descending (most recent first)
    merged.sort((a, b) => parseInt(b.timeStamp, 10) - parseInt(a.timeStamp, 10));
    return merged;
  };

  const displayedTxs = activeTab === 'all'
    ? mergeWithLocal(txList)
    : mergeWithLocal(tokenTxList.length > 0 ? tokenTxList : []);

  if (!isUnlocked || !address) return null;

  return (
      <main className="max-w-md mx-auto w-full px-5 pt-8 pb-40">
        {/* Page title and refresh */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
            Transaction History
          </h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-gray-400 hover:text-white transition-all duration-300 active:scale-95 p-2 rounded-lg hover:bg-white/[0.06]
                       disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin-slow' : ''} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 mb-6 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl">
          {([
            { key: 'all' as TabType, label: 'All' },
            { key: 'tokens' as TabType, label: 'Token Transfers' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold transition-all duration-200
                ${activeTab === tab.key
                  ? 'bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Transaction list */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <span className="text-xs text-gray-500 font-medium">
              {network?.name ?? 'Unknown'} — {displayedTxs.length} transaction{displayedTxs.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <SkeletonRow key={i} index={i} />
              ))}
            </div>
          ) : error ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button
                onClick={handleRefresh}
                className="text-xs text-[#FF6900] font-medium hover:underline"
              >
                Try Again
              </button>
            </div>
          ) : displayedTxs.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/[0.04] flex items-center justify-center">
                <RefreshCw size={20} className="text-gray-600" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No transactions yet</p>
              <p className="text-xs text-gray-600 mt-1">
                {activeTab === 'tokens'
                  ? 'No token transfers found for this address.'
                  : 'Transactions will appear here once you send or receive assets.'}
              </p>
            </div>
          ) : (
            <div>
              {displayedTxs.map((tx, index) => {
                const isSwap = tx.type === 'swap';
                const isNftSend = tx.type === 'send-nft';
                const isSent = tx.from.toLowerCase() === address.toLowerCase();
                const counterparty = isSent ? tx.to : tx.from;
                const timestamp = parseInt(tx.timeStamp, 10);
                const failed = tx.isError === '1';

                // Determine amount and symbol
                let amount: string;
                let symbol: string;
                if (isNftSend) {
                  const count = tx.nftTotalQuantity ?? tx.nftTokenIds?.length ?? 1;
                  amount = `${count}`;
                  symbol = 'NFT';
                } else if (tx.tokenSymbol && tx.tokenDecimal) {
                  // Token transfer
                  const decimals = parseInt(tx.tokenDecimal, 10);
                  const raw = formatUnits(BigInt(tx.value), decimals);
                  const num = parseFloat(raw);
                  amount = num > 1_000_000
                    ? `${(num / 1_000_000).toFixed(2)}M`
                    : num > 1_000
                      ? `${(num / 1_000).toFixed(2)}K`
                      : num < 0.0001 && num > 0
                        ? '<0.0001'
                        : parseFloat(num.toFixed(6)).toString();
                  symbol = tx.tokenSymbol;
                } else {
                  // Native transfer
                  const raw = formatUnits(BigInt(tx.value), 18);
                  const num = parseFloat(raw);
                  amount = num > 1_000
                    ? `${(num / 1_000).toFixed(2)}K`
                    : num < 0.0001 && num > 0
                      ? '<0.0001'
                      : parseFloat(num.toFixed(6)).toString();
                  symbol = network?.nativeToken.symbol ?? 'ETH';
                }

                // Display label
                const txLabel = isNftSend
                  ? `NFT Sent`
                  : isSwap
                    ? `Swap ${tx.fromTokenSymbol ?? ''} → ${tx.toTokenSymbol ?? ''}`
                    : isSent ? 'Sent' : 'Received';

                return (
                  <div
                    key={`${tx.hash}-${index}`}
                    className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.05] last:border-b-0
                               hover:bg-white/[0.02] transition-colors duration-150 cursor-pointer group"
                    style={{ animation: `slide-up-fade 0.4s ease-out ${index * 30}ms both` }}
                    onClick={() => window.open(getExplorerTxUrl(chainId, tx.hash), '_blank')}
                  >
                    {/* Direction icon */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                        ${isNftSend
                          ? 'bg-blue-500/10 text-blue-400'
                          : isSwap
                            ? 'bg-purple-500/10 text-purple-400'
                            : isSent
                              ? 'bg-orange-500/10 text-orange-400'
                              : 'bg-green-500/10 text-green-400'
                        }
                        ${failed ? 'bg-red-500/10 text-red-400' : ''}
                      `}
                    >
                      {isNftSend ? (
                        <ArrowUpRight size={18} />
                      ) : isSwap ? (
                        <ArrowDownUp size={18} />
                      ) : isSent ? (
                        <ArrowUpRight size={18} />
                      ) : (
                        <ArrowDownLeft size={18} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium">
                          {txLabel}
                        </p>
                        {failed && (
                          <span className="text-[10px] font-semibold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                            Failed
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        {isSwap ? (
                          <span className="font-mono">{truncateAddress(tx.hash)}</span>
                        ) : (
                          <>
                            <span>{isSent ? 'To: ' : 'From: '}</span>
                            <ShibName address={counterparty} className="text-[11px]" />
                          </>
                        )}
                      </div>
                    </div>

                    {/* Amount and time */}
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-medium ${isNftSend ? 'text-blue-400' : isSwap ? 'text-purple-400' : isSent ? 'text-orange-400' : 'text-green-400'} ${failed ? 'text-red-400 line-through' : ''}`}>
                        {isNftSend ? '' : isSwap ? '' : isSent ? '-' : '+'}{amount} {symbol}
                      </p>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <span className="text-[10px] text-gray-600">{timeAgo(timestamp)}</span>
                        <ExternalLink size={10} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
  );
};

export default History;
