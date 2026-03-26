import React, { useState } from 'react';
import { Settings, Lock, Key, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ShibLogo from './ShibLogo';
import NetworkBadge from './NetworkBadge';
import AddressPill from './AddressPill';
import { useWalletStore } from '../store/walletStore';

const VAULT_KEY = 'shibwallet_vault';

const Header: React.FC = () => {
  const { isUnlocked, privateKey, lock } = useWalletStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [exportConfirmText, setExportConfirmText] = useState('');

  const handleLock = () => {
    lock();
    setSettingsOpen(false);
    toast.success('Wallet locked');
  };

  const handleExportKey = () => {
    setExportOpen(true);
    setExportConfirmText('');
  };

  const handleConfirmExport = () => {
    if (exportConfirmText !== 'I UNDERSTAND') return;
    if (privateKey) {
      navigator.clipboard.writeText(privateKey).then(() => {
        toast.success('Private key copied to clipboard');
      }).catch(() => {
        toast.error('Failed to copy private key');
      });
    }
    setExportOpen(false);
    setSettingsOpen(false);
    setExportConfirmText('');
  };

  const handleDisconnect = () => {
    localStorage.removeItem(VAULT_KEY);
    useWalletStore.setState({
      address: null,
      privateKey: null,
      mnemonic: null,
      isUnlocked: false,
    });
    setConfirmDisconnect(false);
    setSettingsOpen(false);
    toast.success('Wallet data cleared');
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 border-b border-shib-border bg-shib-bg sticky top-0 z-40">
        {/* Left: Logo + Wordmark */}
        <div className="flex items-center gap-2">
          <ShibLogo size={32} />
          <span className="text-lg font-bold text-white tracking-tight">
            Shib<span className="text-shib-orange">Wallet</span>
          </span>
        </div>

        {/* Right: Network + Address + Settings (only when unlocked) */}
        {isUnlocked && (
          <div className="flex items-center gap-2">
            <NetworkBadge />
            <AddressPill />
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg hover:bg-shib-surface transition-colors text-gray-400 hover:text-white active:scale-95"
            >
              <Settings size={18} />
            </button>
          </div>
        )}
      </header>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-shib-surface border border-shib-border rounded-xl w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-shib-border">
              <h2 className="text-white font-semibold">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors active:scale-95"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-2">
              <button
                onClick={handleExportKey}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm
                           text-white hover:bg-shib-surface-alt transition-colors active:scale-95"
              >
                <Key size={16} className="text-shib-orange" />
                Export Private Key
              </button>
              <button
                onClick={handleLock}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm
                           text-white hover:bg-shib-surface-alt transition-colors active:scale-95"
              >
                <Lock size={16} className="text-shib-orange" />
                Lock Wallet
              </button>
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm
                           text-shib-red hover:bg-shib-surface-alt transition-colors active:scale-95"
              >
                <Trash2 size={16} />
                Disconnect (Clear All Data)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Private Key Warning Modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-shib-surface border border-shib-red rounded-xl w-full max-w-sm mx-4 animate-fade-in">
            <div className="px-4 py-3 border-b border-shib-red/50 bg-shib-red/10">
              <h2 className="text-shib-red font-semibold text-center">Warning</h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-shib-red/10 border border-shib-red/30 rounded-lg p-3">
                <p className="text-sm text-red-300 leading-relaxed">
                  Your private key grants full access to your wallet and funds.
                  Never share it with anyone. Anyone with your private key can
                  steal all your assets.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Type <span className="text-white font-mono">I UNDERSTAND</span> to continue
                </label>
                <input
                  type="text"
                  value={exportConfirmText}
                  onChange={(e) => setExportConfirmText(e.target.value)}
                  placeholder="I UNDERSTAND"
                  className="w-full px-4 py-2.5 rounded-lg bg-shib-bg border border-shib-border
                             text-white placeholder-gray-600 focus:outline-none focus:border-shib-red
                             transition-colors text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setExportOpen(false);
                    setExportConfirmText('');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-shib-surface-alt border border-shib-border
                             text-white text-sm hover:bg-shib-border transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmExport}
                  disabled={exportConfirmText !== 'I UNDERSTAND'}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-shib-red text-white text-sm font-medium
                             disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700
                             transition-colors active:scale-95"
                >
                  Export Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Disconnect Modal */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-shib-surface border border-shib-red rounded-xl w-full max-w-sm mx-4 animate-fade-in">
            <div className="p-4 space-y-4">
              <div className="text-center">
                <Trash2 size={32} className="mx-auto text-shib-red mb-2" />
                <h2 className="text-white font-semibold">Clear All Data?</h2>
                <p className="text-sm text-gray-400 mt-1">
                  This will permanently delete your encrypted vault. Make sure you have
                  backed up your seed phrase or private key before proceeding.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDisconnect(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-shib-surface-alt border border-shib-border
                             text-white text-sm hover:bg-shib-border transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-shib-red text-white text-sm font-medium
                             hover:bg-red-700 transition-colors active:scale-95"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
