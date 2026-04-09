import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Wallet,
  Globe,
  RefreshCw,
  Flame,
  MoreHorizontal,
  CreditCard,
  Newspaper,
  Clock,
} from 'lucide-react';

/* ── Tab definitions ──────────────────────────────────────────────────── */

const MAIN_TABS = [
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/wallet/swap', label: 'Swap', icon: RefreshCw },
  { path: '/wallet/burns', label: 'Burns', icon: Flame },
  { path: '/wallet/dapps', label: 'dApps', icon: Globe },
];

const MORE_ITEMS = [
  { path: '/wallet/buy', label: 'Buy Crypto', icon: CreditCard },
  { path: '/wallet/news', label: 'The Shib', icon: Newspaper },
  { path: '/wallet/history', label: 'History', icon: Clock },
];

/* ── Component ────────────────────────────────────────────────────────── */

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close "More" panel whenever route changes
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const isMoreActive = MORE_ITEMS.some((item) => location.pathname === item.path);

  const renderTab = (
    item: (typeof MAIN_TABS)[number],
    isActive: boolean,
    onClick: () => void,
  ) => {
    const Icon = item.icon;
    return (
      <button
        key={item.path}
        onClick={onClick}
        className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200
          ${isActive ? 'text-[#FF6900]' : 'text-gray-500 hover:text-gray-300 active:scale-95'}`}
      >
        {isActive && (
          <div
            className="absolute inset-0 rounded-xl bg-[#FF6900]/[0.08]"
            style={{ animation: 'fadeIn 200ms ease-out' }}
          />
        )}
        <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} className="relative z-10" />
        <span className={`text-[10px] font-medium relative z-10 ${isActive ? 'font-semibold' : ''}`}>
          {item.label}
        </span>
        {isActive && (
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-gradient-to-r from-[#FF6900] to-[#FFB800]" />
        )}
      </button>
    );
  };

  return (
    <>
      {/* ── More flyout panel ──────────────────────────────────────── */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[45]"
          onClick={() => setMoreOpen(false)}
          style={{ animation: 'fadeIn 150ms ease-out' }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          <div
            className="absolute bottom-[72px] left-4 right-4 max-w-md mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="bg-[#1A1A1A]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-2 shadow-2xl"
              style={{ animation: 'slide-up-fade 200ms ease-out' }}
            >
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setMoreOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors
                      ${active ? 'bg-[#FF6900]/10 text-[#FF6900]' : 'text-gray-300 hover:bg-white/[0.05]'}`}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom nav bar ─────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40">
        <div className="h-px bg-gradient-to-r from-transparent via-[#FF6900]/30 to-transparent" />

        <div className="bg-[#0D0D0D]/90 backdrop-blur-2xl border-t border-white/[0.06]">
          <div className="max-w-md mx-auto flex items-center justify-around px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {MAIN_TABS.map((item) => {
              const isActive =
                item.path === '/wallet'
                  ? location.pathname === '/wallet'
                  : location.pathname === item.path;
              return renderTab(item, isActive, () => navigate(item.path));
            })}

            {/* More button */}
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200
                ${isMoreActive || moreOpen ? 'text-[#FF6900]' : 'text-gray-500 hover:text-gray-300 active:scale-95'}`}
            >
              {(isMoreActive || moreOpen) && (
                <div
                  className="absolute inset-0 rounded-xl bg-[#FF6900]/[0.08]"
                  style={{ animation: 'fadeIn 200ms ease-out' }}
                />
              )}
              <MoreHorizontal
                size={20}
                strokeWidth={isMoreActive ? 2.2 : 1.8}
                className="relative z-10"
              />
              <span
                className={`text-[10px] font-medium relative z-10 ${isMoreActive ? 'font-semibold' : ''}`}
              >
                More
              </span>
              {isMoreActive && (
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-gradient-to-r from-[#FF6900] to-[#FFB800]" />
              )}
            </button>
          </div>
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
