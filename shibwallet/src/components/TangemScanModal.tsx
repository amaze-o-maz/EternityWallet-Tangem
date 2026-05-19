import React, { useEffect, useState } from 'react';
import { X, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { scanAndPrepare, TangemError, TangemErrorCode, nfcStatus } from '../lib/tangem';
import { useTangemUiStore, setTangemUiState, resetTangemUiState } from '../store/tangemUiStore';

export type TangemScanResult = {
  cardId: string;
  walletPublicKey: `0x${string}`;
  address: `0x${string}`;
  createdWallet: boolean;
};

interface ConnectProps {
  open: boolean;
  mode: 'connect';
  onClose: () => void;
  onSuccess: (result: TangemScanResult) => void;
}

interface SignProps {
  open: boolean;
  mode: 'sign';
  onClose?: () => void;
}

/**
 * Reusable modal for both connect (onboarding tap) and sign (transaction
 * tap) flows. In connect mode it owns the scan flow; in sign mode it
 * mirrors the global tangemUiStore state which is updated by the signer
 * implementation in lib/signers.ts.
 */
const TangemScanModal: React.FC<ConnectProps | SignProps> = (props) => {
  const uiState = useTangemUiStore();

  const [connectStatus, setConnectStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [connectMessage, setConnectMessage] = useState<string>('');
  const [connectErrorCode, setConnectErrorCode] = useState<TangemErrorCode | undefined>(undefined);

  // Reset local state when the modal opens
  useEffect(() => {
    if (props.open && props.mode === 'connect') {
      setConnectStatus('idle');
      setConnectMessage('');
      setConnectErrorCode(undefined);
    }
  }, [props.open, props.mode]);

  // Dismiss this modal automatically when the sign flow finishes
  useEffect(() => {
    if (props.mode !== 'sign') return;
    if (!props.open) return;
    if (uiState.status === 'idle') {
      if (props.onClose) props.onClose();
    }
  }, [uiState.status, props.mode, props.open, props]);

  const startScan = async () => {
    setConnectStatus('waiting');
    setConnectMessage('Hold your Tangem card to the back of your phone');
    setConnectErrorCode(undefined);
    try {
      const nfc = await nfcStatus();
      if (!nfc.hasNfc) {
        setConnectStatus('error');
        setConnectErrorCode(TangemErrorCode.NfcUnavailable);
        setConnectMessage("This device doesn't have NFC.");
        return;
      }
      if (!nfc.enabled) {
        setConnectStatus('error');
        setConnectErrorCode(TangemErrorCode.NfcDisabled);
        setConnectMessage('Turn on NFC in your phone settings and try again.');
        return;
      }
      const result = await scanAndPrepare();
      setConnectStatus('success');
      setConnectMessage(result.createdWallet ? 'Card linked. A new wallet was generated.' : 'Card linked successfully.');
      if (props.mode === 'connect') {
        // Small celebratory beat before handing off
        setTimeout(() => props.onSuccess(result), 600);
      }
    } catch (err) {
      const code = err instanceof TangemError ? err.code : TangemErrorCode.Unknown;
      let message: string;
      if (code === TangemErrorCode.UserCancelled) {
        message = 'Scan cancelled.';
      } else if (code === TangemErrorCode.NfcDisabled) {
        message = 'NFC is disabled. Turn it on in your phone settings.';
      } else if (code === TangemErrorCode.NfcUnavailable) {
        message = "This device doesn't have NFC.";
      } else if (code === TangemErrorCode.TagLost) {
        message = 'Card lifted too early. Hold it steady against the phone.';
      } else if (code === TangemErrorCode.Timeout) {
        message = 'No card detected. Try again.';
      } else if (code === TangemErrorCode.WrongCard) {
        message = 'That card is the wrong type for ShibWallet. Try a different Tangem card.';
      } else {
        message = err instanceof Error ? err.message : 'Could not connect to the card.';
      }
      setConnectStatus('error');
      setConnectErrorCode(code);
      setConnectMessage(message);
    }
  };

  if (!props.open) return null;

  const isConnect = props.mode === 'connect';
  const status: 'idle' | 'waiting' | 'success' | 'error' = isConnect
    ? connectStatus
    : (uiState.status as 'idle' | 'waiting' | 'success' | 'error');
  const message = isConnect ? connectMessage : uiState.message;
  const errorCode = isConnect ? connectErrorCode : uiState.errorCode;

  const title = isConnect
    ? status === 'success'
      ? 'Card Connected'
      : status === 'error'
        ? "Couldn't connect"
        : 'Connect your Tangem'
    : status === 'success'
      ? 'Signed'
      : status === 'error'
        ? "Couldn't sign"
        : 'Tap your Tangem card';

  const subtitle = isConnect
    ? status === 'idle'
      ? 'Hold your Tangem card to the back of your phone to link it as your wallet.'
      : message
    : message || 'Hold your Tangem card steady against the back of your phone.';

  const canDismiss = status !== 'waiting';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md animate-backdrop-enter">
      <div className="glass-card w-full max-w-sm mx-4 animate-modal-enter overflow-hidden border border-white/[0.08]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white font-semibold tracking-wide text-sm uppercase">Tangem</h2>
          {canDismiss && (props.mode === 'connect' || props.onClose) && (
            <button
              onClick={() => {
                if (props.mode === 'connect') {
                  props.onClose();
                } else if (props.onClose) {
                  resetTangemUiState();
                  props.onClose();
                }
              }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-95"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="p-6 flex flex-col items-center text-center">
          {/* Big icon area */}
          <div className="relative mb-5">
            {/* Pulse glow when waiting */}
            {status === 'waiting' && (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255, 105, 0, 0.25) 0%, transparent 70%)',
                  transform: 'scale(2.4)',
                  filter: 'blur(20px)',
                  animation: 'pulse-glow 1.5s ease-in-out infinite',
                }}
              />
            )}
            <div
              className={`relative w-20 h-20 rounded-2xl border flex items-center justify-center ${
                status === 'success'
                  ? 'bg-green-500/10 border-green-500/30'
                  : status === 'error'
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-[#FF6900]/10 border-[#FF6900]/30'
              }`}
            >
              {status === 'success' ? (
                <CheckCircle2 size={36} className="text-green-400" />
              ) : status === 'error' ? (
                <AlertTriangle size={36} className="text-red-400" />
              ) : (
                <CreditCard size={36} className="text-[#FF6900]" />
              )}
            </div>
          </div>

          <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
          <p className="text-sm text-gray-400 leading-relaxed mb-5 max-w-[280px]">{subtitle}</p>

          {status === 'waiting' && (
            <p className="text-[11px] text-gray-500 mb-5">Hold steady... it takes about a second.</p>
          )}

          {isConnect && status === 'idle' && (
            <button
              onClick={startScan}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-sm transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]"
            >
              Tap to Scan
            </button>
          )}

          {isConnect && status === 'error' && (
            <div className="w-full flex gap-2">
              <button
                onClick={() => props.onClose()}
                className="flex-1 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]
                           text-white/70 text-sm font-medium transition-all active:scale-[0.97]
                           hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                onClick={startScan}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                           text-white text-sm font-semibold transition-all active:scale-[0.97]
                           hover:shadow-[0_0_20px_rgba(255,105,0,0.3)]"
              >
                Retry
              </button>
            </div>
          )}

          {!isConnect && status === 'error' && (
            <button
              onClick={() => {
                resetTangemUiState();
                if (props.onClose) props.onClose();
              }}
              className="w-full py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]
                         text-white/80 text-sm font-medium transition-all active:scale-[0.97]
                         hover:bg-white/[0.08]"
            >
              Dismiss
            </button>
          )}

          {!isConnect && status === 'waiting' && (
            <p className="text-[10px] text-gray-600 mt-1">
              {errorCode === TangemErrorCode.NfcDisabled
                ? 'Enable NFC in your phone settings.'
                : 'Your Tangem card is signing this transaction.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TangemScanModal;

/**
 * Always-mounted overlay that listens to the global tangemUiStore and
 * renders the sign-mode modal whenever a Tangem signing is in flight.
 * Used in WalletLayout so any signing path automatically shows the UI.
 */
export const TangemSignOverlay: React.FC = () => {
  const status = useTangemUiStore((s) => s.status);
  const mode = useTangemUiStore((s) => s.mode);
  const open = status !== 'idle' && mode === 'sign';
  return (
    <TangemScanModal
      open={open}
      mode="sign"
      onClose={() => resetTangemUiState()}
    />
  );
};
