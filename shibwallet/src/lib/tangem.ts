import { Capacitor, registerPlugin } from '@capacitor/core';
import { keccak256, getAddress } from 'viem';
import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * Native Tangem plugin contract. Implemented in Kotlin under
 * `android/app/src/main/java/com/shibwallet/app/TangemPlugin.kt`. The native
 * side is a thin transport — all Ethereum logic (address derivation,
 * recovery-byte calculation, transaction serialization) lives here.
 */
export interface TangemPlugin {
  nfcAvailable(): Promise<{ hasNfc: boolean; enabled: boolean }>;
  scanCard(options?: { message?: string }): Promise<{
    cardId: string;
    wallets: { publicKey: string; curve: string; index: number }[];
  }>;
  createWallet(options: { cardId: string; curve?: string }): Promise<{
    cardId: string;
    publicKey: string;
    curve: string;
  }>;
  sign(options: {
    cardId: string;
    walletPublicKey: string;
    /** Array of 32-byte hashes, hex-encoded (with or without 0x). */
    hashes: string[];
    message?: string;
  }): Promise<{
    cardId: string;
    /** 64-byte r||s signatures, hex-encoded (with or without 0x). */
    signatures: string[];
  }>;
}

const NativeTangem = registerPlugin<TangemPlugin>('Tangem');

/** Error codes the native side returns (kept in sync with TangemPlugin.kt). */
export const TangemErrorCode = {
  UserCancelled: 'user_cancelled',
  NfcUnavailable: 'nfc_unavailable',
  NfcDisabled: 'nfc_disabled',
  WrongCard: 'wrong_card',
  TagLost: 'tag_lost',
  Timeout: 'timeout',
  NotInitialized: 'not_initialized',
  NoWallet: 'no_wallet',
  Unknown: 'unknown',
} as const;

export type TangemErrorCode = (typeof TangemErrorCode)[keyof typeof TangemErrorCode];

export class TangemError extends Error {
  code: TangemErrorCode;
  constructor(code: TangemErrorCode, message: string) {
    super(message);
    this.name = 'TangemError';
    this.code = code;
  }
}

function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Whether the Tangem entry point can be shown in the UI. Returns false on
 * web/dev so the onboarding button is hidden.
 */
export function tangemAvailable(): boolean {
  return isAndroid();
}

/**
 * Runtime check for NFC hardware + the OS-level NFC toggle. The native
 * plugin returns both. Returns a safe default on non-Android.
 */
export async function nfcStatus(): Promise<{ hasNfc: boolean; enabled: boolean }> {
  if (!isAndroid()) return { hasNfc: false, enabled: false };
  try {
    return await NativeTangem.nfcAvailable();
  } catch {
    return { hasNfc: false, enabled: false };
  }
}

function normalizeHex(input: string): string {
  return input.startsWith('0x') || input.startsWith('0X') ? input.slice(2) : input;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = normalizeHex(hex);
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Normalizes a card-returned secp256k1 pubkey to the uncompressed 65-byte
 * form with the `0x04` prefix. The card may return either 64 bytes (X||Y)
 * or the 65-byte form, depending on firmware.
 */
export function normalizeUncompressedPubkey(hex: string): `0x${string}` {
  const bytes = hexToBytes(hex);
  if (bytes.length === 65) {
    if (bytes[0] !== 0x04) {
      // Compressed (0x02 / 0x03) — decompress via noble.
      const point = secp256k1.ProjectivePoint.fromHex(bytes);
      return `0x${bytesToHex(point.toRawBytes(false))}` as `0x${string}`;
    }
    return `0x${bytesToHex(bytes)}` as `0x${string}`;
  }
  if (bytes.length === 64) {
    const padded = new Uint8Array(65);
    padded[0] = 0x04;
    padded.set(bytes, 1);
    return `0x${bytesToHex(padded)}` as `0x${string}`;
  }
  if (bytes.length === 33) {
    const point = secp256k1.ProjectivePoint.fromHex(bytes);
    return `0x${bytesToHex(point.toRawBytes(false))}` as `0x${string}`;
  }
  throw new Error(`Unexpected pubkey length: ${bytes.length}`);
}

/**
 * Derive an EVM address from an uncompressed secp256k1 public key. The
 * input may include or omit the 0x04 prefix — both forms are handled.
 */
export function pubkeyToAddress(pubkeyHex: string): `0x${string}` {
  const normalized = normalizeUncompressedPubkey(pubkeyHex);
  // keccak256 of the X||Y portion (drop the 04 prefix), last 20 bytes, EIP-55 checksummed.
  const xy = `0x${normalized.slice(4)}` as `0x${string}`;
  const hash = keccak256(xy);
  const addr = `0x${hash.slice(-40)}`;
  return getAddress(addr) as `0x${string}`;
}

/** Helper that translates raw Capacitor errors into our typed TangemError. */
function toTangemError(err: unknown): TangemError {
  if (err instanceof TangemError) return err;
  const anyErr = err as { code?: string; message?: string };
  const code = (anyErr?.code as TangemErrorCode) ?? TangemErrorCode.Unknown;
  const message = anyErr?.message ?? 'Tangem operation failed';
  return new TangemError(code, message);
}

export interface ScanAndPrepareResult {
  cardId: string;
  walletPublicKey: `0x${string}`;
  address: `0x${string}`;
  /** True if a new wallet had to be generated on the card during this flow. */
  createdWallet: boolean;
}

/**
 * Scan the card; if it has no secp256k1 wallet yet, prompt the user to
 * create one (a second tap). Returns the resolved pubkey + EVM address.
 */
export async function scanAndPrepare(): Promise<ScanAndPrepareResult> {
  if (!isAndroid()) {
    throw new TangemError(TangemErrorCode.NfcUnavailable, 'Tangem is only supported on Android.');
  }
  let scan;
  try {
    scan = await NativeTangem.scanCard({ message: 'Connect your Tangem card' });
  } catch (e) {
    throw toTangemError(e);
  }

  // Card stores keys per-curve. We want the secp256k1 one for EVM.
  const sec = scan.wallets.find((w) => w.curve.toLowerCase() === 'secp256k1');
  if (sec) {
    const walletPublicKey = normalizeUncompressedPubkey(sec.publicKey);
    return {
      cardId: scan.cardId,
      walletPublicKey,
      address: pubkeyToAddress(walletPublicKey),
      createdWallet: false,
    };
  }

  // Blank card path — create the secp256k1 wallet (one more tap).
  let created;
  try {
    created = await NativeTangem.createWallet({ cardId: scan.cardId, curve: 'secp256k1' });
  } catch (e) {
    throw toTangemError(e);
  }
  const walletPublicKey = normalizeUncompressedPubkey(created.publicKey);
  return {
    cardId: created.cardId,
    walletPublicKey,
    address: pubkeyToAddress(walletPublicKey),
    createdWallet: true,
  };
}

/**
 * Compute the recovery byte (0 or 1) by recovering the pubkey from the
 * signature under each candidate and picking the match. The card returns
 * raw r||s only — Ethereum needs a recovery byte to derive `v`.
 */
function recoverY(hash: Uint8Array, r: Uint8Array, s: Uint8Array, expectedPubkey: Uint8Array): 0 | 1 {
  const compactSig = new Uint8Array(64);
  compactSig.set(r, 0);
  compactSig.set(s, 32);
  for (const recovery of [0, 1] as const) {
    try {
      const sig = secp256k1.Signature.fromCompact(compactSig).addRecoveryBit(recovery);
      const recovered = sig.recoverPublicKey(hash);
      const recoveredBytes = recovered.toRawBytes(false);
      if (bytesEqual(recoveredBytes, expectedPubkey)) {
        return recovery;
      }
    } catch {
      // try next
    }
  }
  throw new Error('Could not recover signing pubkey — signature or pubkey mismatch.');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface TangemSignature {
  r: `0x${string}`;
  s: `0x${string}`;
  v: bigint;
  yParity: 0 | 1;
}

/**
 * Sign one or more 32-byte hashes with the card. Returns viem-compatible
 * signature objects (r, s, v, yParity). Caller is responsible for the
 * "show NFC prompt" UI — the Tangem SDK presents its own bottom sheet
 * once the call begins.
 */
export async function signHashes(params: {
  cardId: string;
  walletPublicKey: string;
  hashes: `0x${string}`[];
  message?: string;
}): Promise<TangemSignature[]> {
  if (!isAndroid()) {
    throw new TangemError(TangemErrorCode.NfcUnavailable, 'Tangem is only supported on Android.');
  }

  // Surface "NFC disabled" with a clean message before the SDK would otherwise
  // sit in a long timeout. Hardware-missing is impossible to reach for an
  // already-bound Tangem account, but check anyway in case of edge devices.
  const status = await nfcStatus();
  if (!status.hasNfc) {
    throw new TangemError(TangemErrorCode.NfcUnavailable, "This device doesn't have NFC.");
  }
  if (!status.enabled) {
    throw new TangemError(
      TangemErrorCode.NfcDisabled,
      'Turn on NFC in your phone settings and try again.',
    );
  }

  const expectedPubkey = hexToBytes(normalizeUncompressedPubkey(params.walletPublicKey));

  let result;
  try {
    result = await NativeTangem.sign({
      cardId: params.cardId,
      walletPublicKey: params.walletPublicKey,
      hashes: params.hashes,
      message: params.message,
    });
  } catch (e) {
    throw toTangemError(e);
  }
  if (!Array.isArray(result.signatures) || result.signatures.length !== params.hashes.length) {
    throw new TangemError(
      TangemErrorCode.Unknown,
      'Tangem returned an unexpected number of signatures',
    );
  }

  return result.signatures.map((sigHex, i) => {
    const sigBytes = hexToBytes(sigHex);
    if (sigBytes.length !== 64) {
      throw new TangemError(
        TangemErrorCode.Unknown,
        `Tangem signature ${i} has unexpected length ${sigBytes.length}`,
      );
    }
    const r = sigBytes.slice(0, 32);
    const s = sigBytes.slice(32, 64);
    const hashBytes = hexToBytes(params.hashes[i]);
    const yParity = recoverY(hashBytes, r, s, expectedPubkey);
    return {
      r: `0x${bytesToHex(r)}` as `0x${string}`,
      s: `0x${bytesToHex(s)}` as `0x${string}`,
      // Pre-EIP-155 v value — viem's serializer will adjust for chainId / yParity per tx type.
      v: yParity === 0 ? 27n : 28n,
      yParity,
    };
  });
}
