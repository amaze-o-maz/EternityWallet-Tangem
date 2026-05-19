import { create } from 'zustand';
import {
  decryptMnemonic,
  decryptData,
  deriveFromMnemonic,
  deriveFromPrivateKey,
  encryptData,
  hashPassword,
} from '../lib/wallet';

/**
 * Wallet accounts are now a discriminated union — either a hot wallet
 * (private key in memory, encrypted-at-rest vault) or a Tangem hardware
 * wallet (private key never leaves the card, metadata stored in plain
 * localStorage since none of it is secret).
 */
export type Account = HotAccount | TangemAccount;

export interface HotAccount {
  kind: 'hot';
  address: string;
  privateKey: string;
  label: string;
  mnemonic: string | null;
}

export interface TangemAccount {
  kind: 'tangem';
  address: string;
  cardId: string;
  /** Uncompressed secp256k1 pubkey, 65 bytes with 0x04 prefix, hex-encoded. */
  walletPublicKey: string;
  label: string;
}

interface WalletState {
  address: string | null;
  privateKey: string | null;
  mnemonic: string | null;
  isUnlocked: boolean;
  lastActivity: number;
  accounts: Account[];
  activeIndex: number;
  /** Held in memory while unlocked for hot-account encryption. Null for tangem-only installs. */
  _password: string | null;
}

interface WalletActions {
  unlock: (password: string) => void;
  lock: () => void;
  setWallet: (address: string, privateKey: string, mnemonic: string, password: string) => void;
  resetLastActivity: () => void;
  hasVault: () => boolean;
  hasHotVault: () => boolean;
  hasTangemAccounts: () => boolean;
  addAccount: (account: Account) => void;
  switchAccount: (index: number) => void;
  importPrivateKey: (pkHex: string, label?: string) => void;
  removeAccount: (index: number) => void;
  getAccounts: () => Account[];
  /** First-time Tangem onboarding with no prior hot vault. */
  setupTangemOnly: (account: Omit<TangemAccount, 'kind'>) => void;
  /** Boot path for a tangem-only install — load accounts from localStorage. */
  unlockTangemOnly: () => boolean;
  /** Add a Tangem account to an already-unlocked tangem-only install. */
  addTangemAccount: (account: Omit<TangemAccount, 'kind'>) => void;
  activeAccount: () => Account | null;
}

const VAULT_KEY = 'shibwallet_vault';
const ACCOUNTS_KEY = 'shibwallet_accounts';
const TANGEM_ACCOUNTS_KEY = 'shibwallet_tangem_accounts';

function loadAccounts(password: string): HotAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const decrypted = decryptData(raw, password);
    const parsed = JSON.parse(decrypted);
    // Migrate accounts saved before the discriminated union — default to 'hot'.
    return (parsed as Account[]).map((a) => ({ ...a, kind: 'hot' as const })) as HotAccount[];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: HotAccount[], password: string) {
  const encrypted = encryptData(JSON.stringify(accounts), password);
  localStorage.setItem(ACCOUNTS_KEY, encrypted);
}

function loadTangemAccounts(): TangemAccount[] {
  try {
    const raw = localStorage.getItem(TANGEM_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TangemAccount[];
    return parsed.map((a) => ({ ...a, kind: 'tangem' as const }));
  } catch {
    return [];
  }
}

function saveTangemAccounts(accounts: TangemAccount[]) {
  // No encryption — addresses, cardIds and pubkeys are not secret.
  localStorage.setItem(TANGEM_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export const useWalletStore = create<WalletState & WalletActions>((set, get) => ({
  address: null,
  privateKey: null,
  mnemonic: null,
  isUnlocked: false,
  lastActivity: Date.now(),
  accounts: [],
  activeIndex: 0,
  _password: null,

  unlock: (password: string) => {
    const vault = localStorage.getItem(VAULT_KEY);
    if (!vault) {
      throw new Error('No vault found. Please create or import a wallet first.');
    }

    // Try new format first (raw password), then legacy format (hashed password)
    let decrypted: string;
    try {
      decrypted = decryptMnemonic(vault, password);
    } catch {
      // Legacy vaults were encrypted with hashPassword(password)
      decrypted = decryptMnemonic(vault, hashPassword(password));
    }

    let wallet;
    if (decrypted.startsWith('pk:')) {
      const pk = decrypted.slice(3);
      const derived = deriveFromPrivateKey(pk);
      wallet = { address: derived.address, privateKey: derived.privateKey, mnemonic: '' };
    } else {
      wallet = deriveFromMnemonic(decrypted);
    }

    // Load saved accounts (encrypted), ensure primary account is first
    const saved = loadAccounts(password);
    const primary: HotAccount = {
      kind: 'hot',
      address: wallet.address,
      privateKey: wallet.privateKey,
      label: 'Main Wallet',
      mnemonic: wallet.mnemonic || null,
    };

    let accounts: HotAccount[];
    if (saved.length > 0) {
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

    saveAccounts(accounts, password);

    set({
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic || null,
      isUnlocked: true,
      lastActivity: Date.now(),
      accounts,
      activeIndex: 0,
      _password: password,
    });
  },

  lock: () => {
    set({
      privateKey: null,
      mnemonic: null,
      isUnlocked: false,
      accounts: [],
      activeIndex: 0,
      _password: null,
    });
  },

  setWallet: (address: string, privateKey: string, mnemonic: string, password: string) => {
    const primary: HotAccount = {
      kind: 'hot',
      address,
      privateKey,
      label: 'Main Wallet',
      mnemonic: mnemonic || null,
    };

    const accounts = [primary];
    saveAccounts(accounts, password);

    set({
      address,
      privateKey,
      mnemonic: mnemonic || null,
      isUnlocked: true,
      lastActivity: Date.now(),
      accounts,
      activeIndex: 0,
      _password: password,
    });
  },

  resetLastActivity: () => {
    set({ lastActivity: Date.now() });
  },

  hasVault: () => {
    // Back-compat alias — old callers used this to mean "any onboarding done"
    return localStorage.getItem(VAULT_KEY) !== null || loadTangemAccounts().length > 0;
  },

  hasHotVault: () => {
    return localStorage.getItem(VAULT_KEY) !== null;
  },

  hasTangemAccounts: () => {
    return loadTangemAccounts().length > 0;
  },

  addAccount: (account: Account) => {
    const { accounts, _password } = get();
    if (accounts.some((a) => a.address.toLowerCase() === account.address.toLowerCase())) return;
    const updated = [...accounts, account];
    if (account.kind === 'hot') {
      if (!_password) return;
      saveAccounts(updated.filter((a): a is HotAccount => a.kind === 'hot'), _password);
    } else {
      saveTangemAccounts(updated.filter((a): a is TangemAccount => a.kind === 'tangem'));
    }
    set({ accounts: updated });
  },

  switchAccount: (index: number) => {
    const { accounts } = get();
    if (index < 0 || index >= accounts.length) return;
    const account = accounts[index];
    set({
      address: account.address,
      privateKey: account.kind === 'hot' ? account.privateKey : null,
      mnemonic: account.kind === 'hot' ? account.mnemonic : null,
      activeIndex: index,
      lastActivity: Date.now(),
    });
  },

  importPrivateKey: (pkHex: string, label?: string) => {
    const derived = deriveFromPrivateKey(pkHex);
    const account: HotAccount = {
      kind: 'hot',
      address: derived.address,
      privateKey: derived.privateKey,
      label: label || `Account ${get().accounts.length + 1}`,
      mnemonic: null,
    };
    const { accounts, _password } = get();
    // Importing a private key only works inside a hot-wallet install — the
    // shared password is required to encrypt the new account at rest.
    if (!_password) return;
    const existing = accounts.findIndex((a) => a.address.toLowerCase() === account.address.toLowerCase());
    if (existing >= 0) {
      get().switchAccount(existing);
      return;
    }
    const updated = [...accounts, account];
    const hotOnly = updated.filter((a): a is HotAccount => a.kind === 'hot');
    saveAccounts(hotOnly, _password);
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
    const { accounts, activeIndex, _password } = get();
    if (accounts.length <= 1) return;
    if (index === 0) return;
    const removed = accounts[index];
    const updated = accounts.filter((_, i) => i !== index);
    if (removed.kind === 'hot') {
      if (!_password) return;
      saveAccounts(updated.filter((a): a is HotAccount => a.kind === 'hot'), _password);
    } else {
      saveTangemAccounts(updated.filter((a): a is TangemAccount => a.kind === 'tangem'));
    }
    const newIndex = activeIndex >= updated.length ? updated.length - 1 : activeIndex;
    const active = updated[newIndex];
    set({
      accounts: updated,
      activeIndex: newIndex,
      address: active.address,
      privateKey: active.kind === 'hot' ? active.privateKey : null,
      mnemonic: active.kind === 'hot' ? active.mnemonic : null,
    });
  },

  getAccounts: () => {
    return get().accounts;
  },

  setupTangemOnly: (account: Omit<TangemAccount, 'kind'>) => {
    const tangemAccount: TangemAccount = { ...account, kind: 'tangem' };
    saveTangemAccounts([tangemAccount]);
    set({
      address: tangemAccount.address,
      privateKey: null,
      mnemonic: null,
      isUnlocked: true,
      lastActivity: Date.now(),
      accounts: [tangemAccount],
      activeIndex: 0,
      _password: null,
    });
  },

  unlockTangemOnly: () => {
    const saved = loadTangemAccounts();
    if (saved.length === 0) return false;
    const active = saved[0];
    set({
      address: active.address,
      privateKey: null,
      mnemonic: null,
      isUnlocked: true,
      lastActivity: Date.now(),
      accounts: saved,
      activeIndex: 0,
      _password: null,
    });
    return true;
  },

  addTangemAccount: (account: Omit<TangemAccount, 'kind'>) => {
    const tangemAccount: TangemAccount = { ...account, kind: 'tangem' };
    const { accounts } = get();
    if (accounts.some((a) => a.address.toLowerCase() === tangemAccount.address.toLowerCase())) return;
    const updated = [...accounts, tangemAccount];
    saveTangemAccounts(updated.filter((a): a is TangemAccount => a.kind === 'tangem'));
    set({ accounts: updated });
  },

  activeAccount: () => {
    const { accounts, activeIndex } = get();
    return accounts[activeIndex] ?? null;
  },
}));
