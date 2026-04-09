import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNetworkStore } from '../store/networkStore';
import { getAllNetworks, addCustomNetwork, removeCustomNetwork, NetworkConfig } from '../lib/chains';

const NetworkBadge: React.FC = () => {
  const { networkKey, setNetwork } = useNetworkStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Add network form state
  const [formName, setFormName] = useState('');
  const [formChainId, setFormChainId] = useState('');
  const [formRpcUrl, setFormRpcUrl] = useState('');
  const [formExplorer, setFormExplorer] = useState('');
  const [formSymbol, setFormSymbol] = useState('');

  const networks = getAllNetworks();
  const currentNetwork = networks[networkKey];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowAddForm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddNetwork = () => {
    if (!formName.trim() || !formChainId.trim() || !formRpcUrl.trim() || !formSymbol.trim()) {
      toast.error('Fill in all required fields');
      return;
    }
    const chainId = parseInt(formChainId, 10);
    if (isNaN(chainId) || chainId <= 0) {
      toast.error('Invalid Chain ID');
      return;
    }
    // Check for duplicate chain ID
    if (Object.values(networks).some((n) => n.chainId === chainId)) {
      toast.error('A network with this Chain ID already exists');
      return;
    }
    const key = addCustomNetwork({
      name: formName.trim(),
      chainId,
      rpcUrl: formRpcUrl.trim(),
      explorerUrl: formExplorer.trim() || '',
      nativeSymbol: formSymbol.trim(),
    });
    setNetwork(key);
    setShowAddForm(false);
    setFormName('');
    setFormChainId('');
    setFormRpcUrl('');
    setFormExplorer('');
    setFormSymbol('');
    toast.success(`${formName.trim()} added`);
  };

  const handleRemove = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (key === networkKey) {
      setNetwork('shibarium');
    }
    removeCustomNetwork(key);
    toast.success('Network removed');
    setIsOpen(false);
  };

  const networkEntries = Object.entries(networks);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setIsOpen(!isOpen); setShowAddForm(false); }}
        className="flex items-center gap-1.5 px-2.5 py-1 glass-pill
                   hover:bg-white/10 hover:border-white/20
                   transition-all duration-200 text-xs active:scale-95 group"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inset-0 rounded-full bg-green-400 opacity-50"
            style={{ animation: 'connected-pulse 2s ease-in-out infinite' }}
          />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400
                           shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
        </span>
        <span className="text-white font-medium truncate max-w-[80px]">{currentNetwork?.name ?? 'Unknown'}</span>
        <svg
          className={`w-2.5 h-2.5 text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 z-50 animate-fade-in overflow-hidden
                        rounded-2xl border border-white/[0.1] shadow-2xl shadow-black/50"
             style={{ background: 'var(--shib-surface)' }}>

          {!showAddForm ? (
            <>
              <div className="px-4 pt-3 pb-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Networks</p>
              </div>

              <div className="px-1.5 pb-1.5 max-h-60 overflow-y-auto">
                {networkEntries.map(([key, network]) => (
                  <button
                    key={key}
                    onClick={() => { setNetwork(key); setIsOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm text-left rounded-xl
                                transition-all duration-150 active:scale-[0.98] group/item
                      ${key === networkKey
                        ? 'text-white bg-[#FF6900]/[0.12] border border-[#FF6900]/20'
                        : 'text-gray-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
                      }`}
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      {key === networkKey && (
                        <span className="absolute inset-0 rounded-full bg-green-400 opacity-40"
                          style={{ animation: 'connected-pulse 2s ease-in-out infinite' }}
                        />
                      )}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${
                        key === networkKey
                          ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]'
                          : 'bg-gray-600'
                      }`} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium block truncate">{network.name}</span>
                      {network.isCustom && (
                        <span className="text-[10px] text-gray-500">Chain {network.chainId}</span>
                      )}
                    </div>
                    {key === networkKey && (
                      <span className="text-[9px] text-[#FF6900] font-bold uppercase tracking-widest shrink-0">
                        Active
                      </span>
                    )}
                    {network.isCustom && key !== networkKey && (
                      <button
                        onClick={(e) => handleRemove(key, e)}
                        className="p-1 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10
                                   opacity-0 group-hover/item:opacity-100 transition-all shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </button>
                ))}
              </div>

              <div className="border-t border-white/[0.06] px-1.5 py-1.5">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#FF6900]
                             rounded-xl hover:bg-[#FF6900]/[0.08] transition-all active:scale-[0.98]"
                >
                  <Plus size={14} />
                  <span className="font-medium">Add Network</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <p className="text-xs text-white font-semibold">Add Network</p>
                <button onClick={() => setShowAddForm(false)}
                  className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all">
                  <X size={14} />
                </button>
              </div>
              <div className="px-3 pb-3 space-y-2.5">
                <input
                  type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="Network Name *"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                             text-white text-xs placeholder-gray-600 focus:border-[#FF6900]/50 transition-all"
                />
                <input
                  type="text" value={formChainId} onChange={(e) => setFormChainId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Chain ID *"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                             text-white text-xs placeholder-gray-600 focus:border-[#FF6900]/50 transition-all"
                />
                <input
                  type="text" value={formRpcUrl} onChange={(e) => setFormRpcUrl(e.target.value)}
                  placeholder="RPC URL *"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                             text-white text-xs placeholder-gray-600 font-mono focus:border-[#FF6900]/50 transition-all"
                />
                <input
                  type="text" value={formSymbol} onChange={(e) => setFormSymbol(e.target.value)}
                  placeholder="Native Token Symbol * (e.g. ETH)"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                             text-white text-xs placeholder-gray-600 focus:border-[#FF6900]/50 transition-all"
                />
                <input
                  type="text" value={formExplorer} onChange={(e) => setFormExplorer(e.target.value)}
                  placeholder="Block Explorer URL (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]
                             text-white text-xs placeholder-gray-600 font-mono focus:border-[#FF6900]/50 transition-all"
                />
                <button
                  onClick={handleAddNetwork}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                             text-white text-xs font-semibold transition-all active:scale-[0.97]
                             hover:shadow-[0_0_15px_rgba(255,105,0,0.3)]"
                >
                  Add Network
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NetworkBadge;
