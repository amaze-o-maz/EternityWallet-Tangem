import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, ChevronDown, Plus, Key, Trash2, X, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWalletStore, Account } from '../store/walletStore';
import { useShibName } from '../store/snsStore';

const AddressPill: React.FC = () => {
  const { address, accounts, activeIndex, switchAccount, importPrivateKey, removeAccount } = useWalletStore();
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [pkInput, setPkInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const shibName = useShibName(address);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowImport(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!address) return null;

  const truncated = shibName ?? `${address.slice(0, 4)}...${address.slice(-3)}`;

  const handleCopy = async (addr: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      toast.success('Address copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleImport = () => {
    const trimmed = pkInput.trim();
    const isHex64 = /^[0-9a-fA-F]{64}$/.test(trimmed);
    const isHex66 = /^0x[0-9a-fA-F]{64}$/.test(trimmed);
    if (!isHex64 && !isHex66) {
      toast.error('Invalid private key (64 hex chars, with or without 0x)');
      return;
    }
    const keyWithPrefix = isHex64 ? `0x${trimmed}` : trimmed;
    try {
      importPrivateKey(keyWithPrefix, labelInput.trim() || undefined);
      toast.success('Account imported');
      setPkInput('');
      setLabelInput('');
      setShowImport(false);
      setIsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const truncateAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setIsOpen(!isOpen); setShowImport(false); }}
        className="group flex items-center gap-1 px-2.5 py-1 glass-pill
                   hover:bg-white/10 hover:border-white/20
                   hover:shadow-[0_0_20px_rgba(255,105,0,0.1)]
                   transition-all duration-200 text-xs font-mono text-white
                   active:scale-95"
        title="Manage accounts"
      >
        <span className="tracking-wide truncate">{truncated}</span>
        {accounts.length > 1 && (
          <ChevronDown size={12} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 z-50 animate-fade-in overflow-hidden
                        rounded-2xl border border-white/[0.1] shadow-2xl shadow-black/50"
             style={{ background: '#1A1A1A' }}>

          {!showImport ? (
            <>
              <div className="px-4 pt-3 pb-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Accounts</p>
              </div>

              <div className="px-1.5 pb-1 max-h-52 overflow-y-auto">
                {accounts.map((account, i) => (
                  <button
                    key={account.address}
                    onClick={() => { switchAccount(i); setIsOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl
                                transition-all duration-150 active:scale-[0.98] group/acc
                      ${i === activeIndex
                        ? 'bg-[#FF6900]/[0.12] border border-[#FF6900]/20'
                        : 'hover:bg-white/[0.06] border border-transparent'
                      }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0
                      ${i === activeIndex
                        ? 'bg-gradient-to-br from-[#FF6900] to-[#FF8C00] text-white'
                        : 'bg-white/[0.06] text-gray-400'
                      }`}>
                      {account.label.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${i === activeIndex ? 'text-white' : 'text-gray-300'}`}>
                        {account.label}
                      </p>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">{truncateAddr(account.address)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(account.address, e); }}
                        className="p-1 rounded-md text-gray-600 hover:text-white hover:bg-white/[0.06]
                                   opacity-0 group-hover/acc:opacity-100 transition-all"
                      >
                        <Copy size={11} />
                      </button>
                      {i > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeAccount(i); setIsOpen(false); toast.success('Account removed'); }}
                          className="p-1 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10
                                     opacity-0 group-hover/acc:opacity-100 transition-all"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                      {i === activeIndex && (
                        <span className="text-[9px] text-[#FF6900] font-bold uppercase tracking-wider ml-1">
                          Active
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t border-white/[0.06] px-1.5 py-1.5">
                <button
                  onClick={() => setShowImport(true)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#FF6900]
                             rounded-xl hover:bg-[#FF6900]/[0.08] transition-all active:scale-[0.98]"
                >
                  <Key size={14} />
                  <span className="font-medium">Import Private Key</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <p className="text-xs text-white font-semibold">Import Account</p>
                <button onClick={() => setShowImport(false)}
                  className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all">
                  <X size={14} />
                </button>
              </div>
              <div className="px-3 pb-3 space-y-2.5">
                <input
                  type="text" value={labelInput} onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="Account Label (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                             text-white text-xs placeholder-gray-600 focus:border-[#FF6900]/50 transition-all"
                />
                <input
                  type="password" value={pkInput} onChange={(e) => setPkInput(e.target.value)}
                  placeholder="Private Key (0x...) *"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                             text-white text-xs placeholder-gray-600 font-mono focus:border-[#FF6900]/50 transition-all"
                />
                <div className="p-2.5 rounded-lg bg-yellow-500/[0.06] border border-yellow-500/10">
                  <p className="text-[10px] text-yellow-500/80 leading-relaxed">
                    Your private key is stored locally in the browser. Never share it with anyone.
                  </p>
                </div>
                <button
                  onClick={handleImport}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                             text-white text-xs font-semibold transition-all active:scale-[0.97]
                             hover:shadow-[0_0_15px_rgba(255,105,0,0.3)]"
                >
                  Import Account
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressPill;
