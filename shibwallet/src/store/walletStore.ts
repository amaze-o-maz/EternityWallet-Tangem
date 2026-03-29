import { create } from 'zustand';
import {
  decryptMnemonic,
  deriveFromMnemonic,
  deriveFromPrivateKey,
  encryptMnemonic,
  hashPassword,
} from '../lib/wallet';

export interface Account {
  address: string;
  privateKey: string;
  label: string;
  mnemonic: string | null;
}

interface WalletState {
  address: string | null;
  privateKey: string | null;
  mnemonic: string | null;
  isUnlocked: boolean;
  lastActivity: number;
  accounts: Account[];
  activeIndex: number;
}

interface WalletActions {
  unlock: (password: string) => void;
  lock: () => void;
  setWallet: (address: string, privateKey: string, mnemonic: string) => void;
  resetLastActivity: () => void;
  hasVault: () => boolean;
  addAccount: (account: Account) => void;
  switchAccount: (index: number) => void;
  importPrivateKey: (pkHex: string, label?: string) => void;
  removeAccount: (index: number) => void;
  getAccounts: () => Account[];
}

const VAULT_KEY = 'shibwallet_vault';
const ACCOUNTS_KEY = 'shibwallet_accounts';

function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export const useWalletStore = create<WalletState & WalletActions>((set, get) => ({
  address: null,
  privateKey: null,
  mnemonic: null,
  isUnlocked: false,
  lastActivity: Date.now(),
  accounts: [],
  activeIndex: 0,

  unlock: (password: string) => {
    const vault = localStorage.getItem(VAULT_KEY);
    if (!vault) {
      throw new Error('No vault found. Please create or import a wallet first.');
    }

    const hashedPassword = hashPassword(password);
    const decrypted = decryptMnemonic(vault, hashedPassword);

    let wallet;
    if (decrypted.startsWith('pk:')) {
      const pk = decrypted.slice(3);
      const derived = deriveFromPrivateKey(pk);
      wallet = { address: derived.address, privateKey: derived.privateKey, mnemonic: '' };
    } else {
      wallet = deriveFromMnemonic(decrypted);
    }

    // Load saved accounts, ensure primary account is first
    const saved = loadAccounts();
    const primary: Account = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      label: 'Main Wallet',
      mnemonic: wallet.mnemonic || null,
    };

    let accounts: Account[];
    if (saved.length > 0) {
      // Update the primary account in saved list
      const existing = saved.findIndex((a) => a.address.toLowerCase() === primary.address.toLowerCase());
      if (existing >= 0) {
        saved[existing] = { ...saved[existing], privateKey: primary.privateKey, mnemonic: primary.mnemonic };
        accounts = saved;
      } else {
        accounts = [primary, ...saved];
      }
    } else {
      accounts = [primary];
    }

    saveAccounts(accounts);

    set({
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic || null,
      isUnlocked: true,
      lastActivity: Date.now(),
      accounts,
      activeIndex: 0,
    });
  },

  lock: () => {
    set({
      privateKey: null,
      mnemonic: null,
      isUnlocked: false,
      accounts: [],
      activeIndex: 0,
    });
  },

  setWallet: (address: string, privateKey: string, mnemonic: string) => {
    const primary: Account = {
      address,
      privateKey,
      label: 'Main Wallet',
      mnemonic: mnemonic || null,
    };

    const saved = loadAccounts();
    let accounts: Account[];
    if (saved.length > 0) {
      const existing = saved.findIndex((a) => a.address.toLowerCase() === primary.address.toLowerCase());
      if (existing >= 0) {
        saved[existing] = primary;
        accounts = saved;
      } else {
        accounts = [primary, ...saved];
      }
    } else {
      accounts = [primary];
    }
    saveAccounts(accounts);

    set({
      address,
      privateKey,
      mnemonic: mnemonic || null,
      isUnlocked: true,
      lastActivity: Date.now(),
      accounts,
      activeIndex: 0,
    });
  },

  resetLastActivity: () => {
    set({ lastActivity: Date.now() });
  },

  hasVault: () => {
    return localStorage.getItem(VAULT_KEY) !== null;
  },

  addAccount: (account: Account) => {
    const { accounts } = get();
    // Don't add duplicates
    if (accounts.some((a) => a.address.toLowerCase() === account.address.toLowerCase())) return;
    const updated = [...accounts, account];
    saveAccounts(updated);
    set({ accounts: updated });
  },

  switchAccount: (index: number) => {
    const { accounts } = get();
    if (index < 0 || index >= accounts.length) return;
    const account = accounts[index];
    set({
      address: account.address,
      privateKey: account.privateKey,
      mnemonic: account.mnemonic,
      activeIndex: index,
      lastActivity: Date.now(),
    });
  },

  importPrivateKey: (pkHex: string, label?: string) => {
    const derived = deriveFromPrivateKey(pkHex);
    const account: Account = {
      address: derived.address,
      privateKey: derived.privateKey,
      label: label || `Account ${get().accounts.length + 1}`,
      mnemonic: null,
    };
    const { accounts } = get();
    // Check for duplicate
    const existing = accounts.findIndex((a) => a.address.toLowerCase() === account.address.toLowerCase());
    if (existing >= 0) {
      // Switch to it
      get().switchAccount(existing);
      return;
    }
    const updated = [...accounts, account];
    saveAccounts(updated);
    const newIndex = updated.length - 1;
    set({
      accounts: updated,
      address: account.address,
      privateKey: account.privateKey,
      mnemonic: null,
      activeIndex: newIndex,
      lastActivity: Date.now(),
    });
  },

  removeAccount: (index: number) => {
    const { accounts, activeIndex } = get();
    if (accounts.length <= 1) return; // Can't remove last account
    if (index === 0) return; // Can't remove primary
    const updated = accounts.filter((_, i) => i !== index);
    saveAccounts(updated);
    const newIndex = activeIndex >= updated.length ? updated.length - 1 : activeIndex;
    const active = updated[newIndex];
    set({
      accounts: updated,
      activeIndex: newIndex,
      address: active.address,
      privateKey: active.privateKey,
      mnemonic: active.mnemonic,
    });
  },

  getAccounts: () => {
    return get().accounts;
  },
}));
