import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Wallet,
  Globe,
  RefreshCw,
  Flame,
  CreditCard,
  Newspaper,
  Clock,
} from 'lucide-react';

/* ── Tab definitions ──────────────────────────────────────────────────── */

const ROW1 = [
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/wallet/swap', label: 'Swap', icon: RefreshCw },
  { path: '/wallet/burns', label: 'Burns', icon: Flame },
  { path: '/wallet/dapps', label: 'dApps', icon: Globe },
];

const ROW2 = [
  { path: '/wallet/buy', label: 'Buy', icon: CreditCard },
  { path: '/wallet/news', label: 'The Shib', icon: Newspaper },
  { path: '/wallet/history', label: 'History', icon: Clock },
];

/* ── Component ────────────────────────────────────────────────────────── */

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const renderTab = (item: (typeof ROW1)[number]) => {
    const Icon = item.icon;
    const isActive =
      item.path === '/wallet'
        ? location.pathname === '/wallet'
        : location.pathname === item.path;

    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200
          ${isActive ? 'text-[#FF6900]' : 'text-gray-500 hover:text-gray-300 active:scale-95'}`}
      >
        {isActive && (
          <div
            className="absolute inset-0 rounded-xl bg-[#FF6900]/[0.08]"
            style={{ animation: 'fadeIn 200ms ease-out' }}
          />
        )}
        <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className="relative z-10" />
        <span
          className={`text-[9px] font-medium relative z-10 ${isActive ? 'font-semibold' : ''}`}
        >
          {item.label}
        </span>
        {isActive && (
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-gradient-to-r from-[#FF6900] to-[#FFB800]" />
        )}
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      {/* Top gradient border */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FF6900]/30 to-transparent" />

      <div className="bg-[#0D0D0D]/90 backdrop-blur-2xl border-t border-white/[0.06]">
        <div className="max-w-md mx-auto px-3 pt-1.5 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {/* Row 1 — primary */}
          <div className="flex items-center justify-around">
            {ROW1.map(renderTab)}
          </div>

          {/* Divider */}
          <div className="h-px mx-6 my-0.5 bg-white/[0.04]" />

          {/* Row 2 — secondary */}
          <div className="flex items-center justify-around px-6">
            {ROW2.map(renderTab)}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
