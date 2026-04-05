import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatUnits } from 'viem';
import { ArrowUpRight, ArrowDownLeft, ArrowDownUp, RefreshCw, ExternalLink } from 'lucide-react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useTransactionStore, type StoredTransaction } from '../store/transactionStore';
import { getNetworkByChainId } from '../lib/chains';

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
  type?: 'send' | 'swap';
  fromTokenSymbol?: string;
  toTokenSymbol?: string;
  toAmount?: string;
  isLocal?: boolean;
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
  if (chainId === 1) return 'https://api.etherscan.io/api';
  if (chainId === 109) return 'https://shibariumscan.io/api';
  return 'https://api.etherscan.io/api';
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

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [txList, setTxList] = useState<Transaction[]>([]);
  const [tokenTxList, setTokenTxList] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('shibwallet_vault')) {
      navigate('/', { replace: true });
      return;
    }
    if (!isUnlocked) {
      navigate('/lock', { replace: true });
    }
  }, [isUnlocked, navigate]);

  const fetchTransactions = useCallback(async () => {
    if (!address) return;

    setError(null);
    const apiUrl = getExplorerApiUrl(chainId);
    const addr = address.toLowerCase();

    try {
      const [txRes, tokenRes] = await Promise.all([
        fetch(
          `${apiUrl}?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`
        ).then((r) => r.json()),
        fetch(
          `${apiUrl}?module=account&action=tokentx&address=${addr}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`
        ).then((r) => r.json()),
      ]);

      if (txRes.status === '1' && Array.isArray(txRes.result)) {
        setTxList(txRes.result);
      } else {
        setTxList([]);
      }

      if (tokenRes.status === '1' && Array.isArray(tokenRes.result)) {
        setTokenTxList(tokenRes.result);
      } else {
        setTokenTxList([]);
      }
    } catch (err) {
      console.error('[ShibWallet] Failed to fetch transaction history:', err);
      // Only show error if there are no local transactions to fall back on
      const localTxs = useTransactionStore.getState().transactions.filter(
        (t) => t.chainId === chainId,
      );
      if (localTxs.length === 0) {
        setError('Failed to load transactions. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    setLoading(true);
    setTxList([]);
    setTokenTxList([]);
    fetchTransactions();
  }, [fetchTransactions]);

  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    fetchTransactions();
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
    <div className="flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      {/* Subtle background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <Header />

      <main className="flex-1 max-w-md mx-auto w-full px-5 pt-8 pb-24 relative z-10">
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
                const isSent = tx.from.toLowerCase() === address.toLowerCase();
                const counterparty = isSent ? tx.to : tx.from;
                const timestamp = parseInt(tx.timeStamp, 10);
                const failed = tx.isError === '1';

                // Determine amount and symbol
                let amount: string;
                let symbol: string;
                if (tx.tokenSymbol && tx.tokenDecimal) {
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
                const txLabel = isSwap
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
                        ${isSwap
                          ? 'bg-purple-500/10 text-purple-400'
                          : isSent
                            ? 'bg-orange-500/10 text-orange-400'
                            : 'bg-green-500/10 text-green-400'
                        }
                        ${failed ? 'bg-red-500/10 text-red-400' : ''}
                      `}
                    >
                      {isSwap ? (
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
                      <p className="text-xs text-gray-500 font-mono mt-0.5">
                        {isSwap ? truncateAddress(tx.hash) : (isSent ? 'To: ' : 'From: ') + truncateAddress(counterparty)}
                      </p>
                    </div>

                    {/* Amount and time */}
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-medium ${isSwap ? 'text-purple-400' : isSent ? 'text-orange-400' : 'text-green-400'} ${failed ? 'text-red-400 line-through' : ''}`}>
                        {isSwap ? '' : isSent ? '-' : '+'}{amount} {symbol}
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

      <BottomNav />
    </div>
  );
};

export default History;
