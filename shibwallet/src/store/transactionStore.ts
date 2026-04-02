import { create } from 'zustand';

export interface StoredTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  type: 'send' | 'swap';
  chainId: number;
  tokenSymbol?: string;
  tokenDecimal?: string;
  tokenName?: string;
  // Swap-specific fields
  fromTokenSymbol?: string;
  toTokenSymbol?: string;
  toAmount?: string;
}

const STORAGE_KEY = 'shibwallet_transactions';

function loadTransactions(): StoredTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTransactions(txs: StoredTransaction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
}

interface TransactionStoreState {
  transactions: StoredTransaction[];
}

interface TransactionStoreActions {
  addTransaction: (tx: StoredTransaction) => void;
  getTransactionsForChain: (chainId: number) => StoredTransaction[];
  loadFromStorage: () => void;
}

export const useTransactionStore = create<TransactionStoreState & TransactionStoreActions>(
  (set, get) => ({
    transactions: loadTransactions(),

    addTransaction: (tx: StoredTransaction) => {
      const current = get().transactions;
      // Avoid duplicates by hash
      if (current.some((t) => t.hash.toLowerCase() === tx.hash.toLowerCase())) return;
      const updated = [tx, ...current];
      saveTransactions(updated);
      set({ transactions: updated });
    },

    getTransactionsForChain: (chainId: number) => {
      return get().transactions.filter((tx) => tx.chainId === chainId);
    },

    loadFromStorage: () => {
      set({ transactions: loadTransactions() });
    },
  }),
);
