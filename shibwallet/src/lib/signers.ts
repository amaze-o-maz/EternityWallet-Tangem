import {
  hashMessage,
  hashTypedData,
  keccak256,
  serializeSignature,
  serializeTransaction,
  type Account as ViemAccount,
} from 'viem';
import { privateKeyToAccount, toAccount } from 'viem/accounts';
import type { Account, HotAccount, TangemAccount } from '../store/walletStore';
import { signHashes, TangemError, TangemErrorCode } from './tangem';
import { setTangemUiState, resetTangemUiState } from '../store/tangemUiStore';

/** Friendlier copy for the sign-time error modal. */
function signingErrorCopy(err: unknown): string {
  if (err instanceof TangemError) {
    switch (err.code) {
      case TangemErrorCode.UserCancelled:
        return 'Tap cancelled — transaction not sent.';
      case TangemErrorCode.NfcDisabled:
        return 'NFC is off. Turn it on in your phone settings and try again.';
      case TangemErrorCode.NfcUnavailable:
        return "This device doesn't have NFC.";
      case TangemErrorCode.TagLost:
        return 'Card lifted too early. Hold it steady against the phone.';
      case TangemErrorCode.Timeout:
        return 'No card detected. Try again.';
      case TangemErrorCode.WrongCard:
        return 'Please tap the card linked to this account.';
      default:
        return err.message || 'Tangem signing failed.';
    }
  }
  return err instanceof Error ? err.message : 'Tangem signing failed.';
}

/**
 * Returns a viem-compatible Account for the given store account, routing
 * signing through either the in-memory privateKey (hot) or NFC (tangem).
 * Once we have a viem Account, every existing createWalletClient call
 * site works unchanged for both backends.
 */
export function getViemAccount(account: Account): ViemAccount {
  if (account.kind === 'hot') {
    return getHotViemAccount(account);
  }
  return getTangemViemAccount(account);
}

function getHotViemAccount(account: HotAccount): ViemAccount {
  return privateKeyToAccount(account.privateKey as `0x${string}`);
}

function getTangemViemAccount(account: TangemAccount): ViemAccount {
  const { cardId, walletPublicKey, address } = account;

  /**
   * Sign a single 32-byte hash via NFC. Wraps the call with UI state so
   * the React modal can show "Tap your card" / errors. The Tangem SDK
   * itself presents the native NFC bottom sheet once it's running.
   */
  async function signOne(hash: `0x${string}`, message: string): Promise<`0x${string}`> {
    setTangemUiState({ mode: 'sign', status: 'waiting', message });
    try {
      const [sig] = await signHashes({
        cardId,
        walletPublicKey,
        hashes: [hash],
        message,
      });
      setTangemUiState({ mode: 'sign', status: 'success', message: 'Signed!' });
      // Brief success state before the modal auto-dismisses.
      setTimeout(resetTangemUiState, 500);
      // hex with 0x prefix, r||s||v (65 bytes) — viem's `serializeSignature`
      return serializeSignature({ r: sig.r, s: sig.s, v: sig.v, yParity: sig.yParity });
    } catch (err) {
      const code = err instanceof TangemError ? err.code : TangemErrorCode.Unknown;
      setTangemUiState({ mode: 'sign', status: 'error', message: signingErrorCopy(err), errorCode: code });
      throw err;
    }
  }

  return toAccount({
    address: address as `0x${string}`,
    async signMessage({ message }) {
      const hash = hashMessage(message);
      return signOne(hash, 'Approve message signature');
    },
    async signTransaction(transaction, { serializer } = {}) {
      const serialize = serializer ?? serializeTransaction;
      const unsigned = await serialize(transaction);
      const hash = keccak256(unsigned);

      setTangemUiState({ mode: 'sign', status: 'waiting', message: 'Tap your Tangem card to confirm' });
      try {
        const [sig] = await signHashes({
          cardId,
          walletPublicKey,
          hashes: [hash],
          message: 'Approve transaction',
        });
        setTangemUiState({ mode: 'sign', status: 'success', message: 'Signed!' });
        setTimeout(resetTangemUiState, 500);
        // serialize() with a signature returns the final signed-tx bytes.
        return (await serialize(transaction, {
          r: sig.r,
          s: sig.s,
          v: sig.v,
          yParity: sig.yParity,
        })) as `0x${string}`;
      } catch (err) {
        const code = err instanceof TangemError ? err.code : TangemErrorCode.Unknown;
        const msg = err instanceof Error ? err.message : 'Tangem signing failed';
        setTangemUiState({ mode: 'sign', status: 'error', message: msg, errorCode: code });
        throw err;
      }
    },
    async signTypedData(typedData) {
      const hash = hashTypedData(typedData);
      return signOne(hash, 'Approve typed-data signature');
    },
  });
}
