import React, { useState } from 'react';
import { Settings, Lock, Key, Trash2, X, Palette, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import ShibLogo from './ShibLogo';
import NetworkBadge from './NetworkBadge';
import AddressPill from './AddressPill';
import { useWalletStore } from '../store/walletStore';
import { useThemeStore, THEMES, type ThemeKey } from '../store/themeStore';

const VAULT_KEY = 'shibwallet_vault';

const THEME_ORDER: ThemeKey[] = ['shib', 'midnight', 'emerald', 'sakura', 'royal', 'amoled'];

const Header: React.FC = () => {
  const { isUnlocked, privateKey, lock } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
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
      <header className="relative flex items-center justify-between px-3 py-2.5 sticky top-0 z-40
                          bg-white/[0.03] backdrop-blur-2xl border-b border-white/[0.06]">
        {/* Left: Logo + Wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, var(--shib-glow-strong) 0%, transparent 70%)',
                transform: 'scale(1.8)',
                filter: 'blur(4px)',
              }}
            />
            <ShibLogo size={26} className="relative z-10" />
          </div>
          <span className="text-sm font-bold tracking-tight select-none">
            <span className="text-white">Shib</span>
            <span className="gradient-text">Wallet</span>
          </span>
        </div>

        {/* Right: Network + Address + Settings (only when unlocked) */}
        {isUnlocked && (
          <div className="flex items-center gap-1.5 min-w-0">
            <NetworkBadge />
            <AddressPill />
            <button
              onClick={() => setSettingsOpen(true)}
              className="relative p-1.5 rounded-lg glass-pill hover:bg-white/10
                         transition-all duration-200 text-gray-400 hover:text-white
                         active:scale-95 group shrink-0"
            >
              <Settings size={15} className="transition-transform duration-300 group-hover:rotate-90" />
            </button>
          </div>
        )}

        {/* Bottom gradient accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, var(--shib-glow-strong) 50%, transparent 100%)`,
          }}
        />
      </header>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-backdrop-enter">
          <div className="glass-card w-full max-w-sm mx-4 animate-modal-enter overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-white font-semibold tracking-wide text-sm uppercase">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white
                           transition-all duration-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-2">
              <button
                onClick={handleExportKey}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-sm
                           text-white hover:bg-white/[0.06] transition-all duration-200 active:scale-[0.98] group"
              >
                <div className="p-2 rounded-lg bg-shib-orange/10 group-hover:bg-shib-orange/20 transition-colors">
                  <Key size={15} className="text-shib-orange" />
                </div>
                <div>
                  <div className="font-medium">Export Private Key</div>
                  <div className="text-xs text-gray-500 mt-0.5">Copy key to clipboard</div>
                </div>
              </button>
              <button
                onClick={handleLock}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-sm
                           text-white hover:bg-white/[0.06] transition-all duration-200 active:scale-[0.98] group"
              >
                <div className="p-2 rounded-lg bg-shib-orange/10 group-hover:bg-shib-orange/20 transition-colors">
                  <Lock size={15} className="text-shib-orange" />
                </div>
                <div>
                  <div className="font-medium">Lock Wallet</div>
                  <div className="text-xs text-gray-500 mt-0.5">Require password to access</div>
                </div>
              </button>

              {/* Theme Picker */}
              <div className="my-1 mx-4 border-t border-white/[0.04]" />
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <Palette size={14} className="text-shib-orange" />
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Theme</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {THEME_ORDER.map((key) => {
                    const t = THEMES[key];
                    const active = theme === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setTheme(key)}
                        className={`relative flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl
                                    transition-all duration-200 active:scale-95
                                    ${active
                                      ? 'bg-white/[0.08] border border-white/20'
                                      : 'hover:bg-white/[0.04] border border-transparent'
                                    }`}
                      >
                        <div className="relative">
                          <div
                            className="w-8 h-8 rounded-full border-2"
                            style={{
                              background: `linear-gradient(135deg, ${t.accent}, ${t.secondary})`,
                              borderColor: active ? '#fff' : 'rgba(255,255,255,0.1)',
                            }}
                          />
                          {active && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Check size={14} className="text-white drop-shadow-lg" />
                            </div>
                          )}
                        </div>
                        <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-gray-500'}`}>
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="my-1 mx-4 border-t border-white/[0.04]" />
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-sm
                           text-red-400 hover:bg-red-500/[0.06] transition-all duration-200 active:scale-[0.98] group"
              >
                <div className="p-2 rounded-lg bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
                  <Trash2 size={15} />
                </div>
                <div>
                  <div className="font-medium">Disconnect Wallet</div>
                  <div className="text-xs text-gray-500 mt-0.5">Clear all local data</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Private Key Warning Modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md animate-backdrop-enter">
          <div className="glass-card w-full max-w-sm mx-4 animate-modal-enter overflow-hidden
                          border-red-500/30 animate-red-pulse-glow">
            <div className="px-5 py-3.5 border-b border-red-500/20"
              style={{
                background: 'linear-gradient(135deg, rgba(196, 27, 14, 0.15) 0%, rgba(196, 27, 14, 0.05) 100%)',
              }}
            >
              <h2 className="text-red-400 font-semibold text-center text-sm uppercase tracking-wider">
                Security Warning
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="glass-card-sm p-4 border-red-500/20 bg-red-500/5">
                <p className="text-sm text-red-300/90 leading-relaxed">
                  Your private key grants full access to your wallet and funds.
                  Never share it with anyone. Anyone with your private key can
                  steal all your assets.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-2 tracking-wide">
                  Type <span className="text-white font-mono font-medium bg-white/5 px-1.5 py-0.5 rounded">I UNDERSTAND</span> to continue
                </label>
                <input
                  type="text"
                  value={exportConfirmText}
                  onChange={(e) => setExportConfirmText(e.target.value)}
                  placeholder="I UNDERSTAND"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10
                             text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50
                             transition-all duration-200 text-sm backdrop-blur-xl"
                />
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    setExportOpen(false);
                    setExportConfirmText('');
                  }}
                  className="btn-secondary flex-1 py-2.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmExport}
                  disabled={exportConfirmText !== 'I UNDERSTAND'}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium
                             disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-500
                             transition-all duration-200 active:scale-95
                             shadow-[0_4px_15px_rgba(196,27,14,0.3)]
                             hover:shadow-[0_6px_25px_rgba(196,27,14,0.45)]"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md animate-backdrop-enter">
          <div className="glass-card w-full max-w-sm mx-4 animate-modal-enter overflow-hidden border-red-500/20">
            <div className="p-6 space-y-5">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-3
                                border border-red-500/20">
                  <Trash2 size={26} className="text-red-400" />
                </div>
                <h2 className="text-white font-semibold text-lg tracking-tight">Clear All Data?</h2>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                  This will permanently delete your encrypted vault. Make sure you have
                  backed up your seed phrase or private key before proceeding.
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmDisconnect(false)}
                  className="btn-secondary flex-1 py-2.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium
                             hover:bg-red-500 transition-all duration-200 active:scale-95
                             shadow-[0_4px_15px_rgba(196,27,14,0.3)]
                             hover:shadow-[0_6px_25px_rgba(196,27,14,0.45)]"
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
