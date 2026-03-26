import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount } from 'viem/accounts';
import CryptoJS from 'crypto-js';

const HD_PATH = "m/44'/60'/0'/0/0";

export interface WalletData {
  mnemonic: string;
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}` as `0x${string}`;
}

export function createWallet(): WalletData {
  const mnemonic = generateMnemonic(wordlist, 128);
  return deriveFromMnemonic(mnemonic);
}

export function deriveFromMnemonic(mnemonic: string): WalletData {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const masterKey = HDKey.fromMasterSeed(seed);
  const child = masterKey.derive(HD_PATH);

  if (!child.privateKey) {
    throw new Error('Failed to derive private key');
  }

  const privateKeyHex = bytesToHex(child.privateKey);
  const account = privateKeyToAccount(privateKeyHex);

  return {
    mnemonic,
    privateKey: privateKeyHex,
    address: account.address,
  };
}

export function deriveFromPrivateKey(privateKeyHex: string): Omit<WalletData, 'mnemonic'> {
  const formattedKey: `0x${string}` = privateKeyHex.startsWith('0x')
    ? (privateKeyHex as `0x${string}`)
    : (`0x${privateKeyHex}` as `0x${string}`);

  const account = privateKeyToAccount(formattedKey);

  return {
    privateKey: formattedKey,
    address: account.address,
  };
}

export function encryptMnemonic(mnemonic: string, password: string): string {
  return CryptoJS.AES.encrypt(mnemonic, password).toString();
}

export function decryptMnemonic(ciphertext: string, password: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, password);
  const decrypted = bytes.toString(CryptoJS.enc.Utf8);

  if (!decrypted) {
    throw new Error('Decryption failed: invalid password or corrupted data');
  }

  return decrypted;
}

export function hashPassword(password: string): string {
  return CryptoJS.SHA256(password).toString();
}
