import { create } from 'zustand';
import {
  decryptMnemonic,
  deriveFromMnemonic,
  deriveFromPrivateKey,
  hashPassword,
} from '../lib/wallet';

interface WalletState {
  address: string | null;
  privateKey: string | null;
  mnemonic: string | null;
  isUnlocked: boolean;
  lastActivity: number;
}

interface WalletActions {
  unlock: (password: string) => void;
  lock: () => void;
  setWallet: (address: string, privateKey: string, mnemonic: string) => void;
  resetLastActivity: () => void;
  hasVault: () => boolean;
}

const VAULT_KEY = 'shibwallet_vault';

export const useWalletStore = create<WalletState & WalletActions>((set) => ({
  address: null,
  privateKey: null,
  mnemonic: null,
  isUnlocked: false,
  lastActivity: Date.now(),

  unlock: (password: string) => {
    const vault = localStorage.getItem(VAULT_KEY);
    if (!vault) {
      throw new Error('No vault found. Please create or import a wallet first.');
    }

    const hashedPassword = hashPassword(password);
    const mnemonic = decryptMnemonic(vault, hashedPassword);
    const wallet = deriveFromMnemonic(mnemonic);

    set({
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic,
      isUnlocked: true,
      lastActivity: Date.now(),
    });
  },

  lock: () => {
    set({
      privateKey: null,
      mnemonic: null,
      isUnlocked: false,
    });
  },

  setWallet: (address: string, privateKey: string, mnemonic: string) => {
    set({
      address,
      privateKey,
      mnemonic,
      isUnlocked: true,
      lastActivity: Date.now(),
    });
  },

  resetLastActivity: () => {
    set({ lastActivity: Date.now() });
  },

  hasVault: () => {
    return localStorage.getItem(VAULT_KEY) !== null;
  },
}));
