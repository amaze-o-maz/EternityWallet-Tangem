import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount } from 'viem/accounts';
import CryptoJS from 'crypto-js';

const HD_PATH = "m/44'/60'/0'/0/0";
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_SIZE = 256 / 32; // 256-bit key

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

/**
 * Derives an encryption key from a password using PBKDF2 with 100k iterations.
 * Returns { key, salt } where salt is hex-encoded.
 * If an existing salt is provided, it reuses that salt (for decryption).
 */
function deriveKey(password: string, existingSalt?: string): { key: CryptoJS.lib.WordArray; salt: CryptoJS.lib.WordArray } {
  const salt = existingSalt
    ? CryptoJS.enc.Hex.parse(existingSalt)
    : CryptoJS.lib.WordArray.random(128 / 8); // 128-bit salt

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: PBKDF2_KEY_SIZE,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });

  return { key, salt };
}

/**
 * Encrypts data with PBKDF2-derived key + AES-256.
 * Output format: salt_hex:iv_hex:ciphertext_base64
 */
export function encryptMnemonic(plaintext: string, password: string): string {
  const { key, salt } = deriveKey(password);
  const iv = CryptoJS.lib.WordArray.random(128 / 8); // 128-bit IV

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Store salt:iv:ciphertext so we can decrypt later
  return [
    CryptoJS.enc.Hex.stringify(salt),
    CryptoJS.enc.Hex.stringify(iv),
    encrypted.ciphertext.toString(CryptoJS.enc.Base64),
  ].join(':');
}

/**
 * Decrypts data encrypted by encryptMnemonic.
 * Accepts both new format (salt:iv:ciphertext) and legacy format (CryptoJS default).
 */
export function decryptMnemonic(ciphertext: string, password: string): string {
  // Detect format: new format has exactly 2 colons (salt:iv:data)
  const parts = ciphertext.split(':');

  if (parts.length === 3) {
    // New PBKDF2 format
    const [saltHex, ivHex, dataB64] = parts;
    const { key } = deriveKey(password, saltHex);
    const iv = CryptoJS.enc.Hex.parse(ivHex);

    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(dataB64),
    });

    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) {
      throw new Error('Decryption failed: invalid password or corrupted data');
    }
    return result;
  }

  // Legacy format: CryptoJS default passphrase-based encryption
  // This handles vaults created before the PBKDF2 upgrade
  const bytes = CryptoJS.AES.decrypt(ciphertext, password);
  const decrypted = bytes.toString(CryptoJS.enc.Utf8);

  if (!decrypted) {
    throw new Error('Decryption failed: invalid password or corrupted data');
  }

  return decrypted;
}

/**
 * Encrypt arbitrary JSON data (for accounts array).
 */
export function encryptData(data: string, password: string): string {
  return encryptMnemonic(data, password);
}

/**
 * Decrypt arbitrary JSON data (for accounts array).
 */
export function decryptData(ciphertext: string, password: string): string {
  return decryptMnemonic(ciphertext, password);
}

/**
 * Hash password — kept for backward compatibility with legacy vaults.
 * New vaults use PBKDF2 internally, so this is only needed for
 * decrypting legacy vaults created before the upgrade.
 */
export function hashPassword(password: string): string {
  return CryptoJS.SHA256(password).toString();
}
