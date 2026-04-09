import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Wallet, Globe, RefreshCw, Clock } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/wallet/swap', label: 'Swap', icon: RefreshCw },
  { path: '/wallet/history', label: 'History', icon: Clock },
  { path: '/wallet/dapps', label: 'dApps', icon: Globe },
];

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40">
      {/* Top gradient border */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#FF6900]/30 to-transparent" />

      <div className="bg-[#0D0D0D]/90 backdrop-blur-2xl border-t border-white/[0.06]">
        <div className="max-w-md mx-auto flex items-center justify-around px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/wallet'
              ? location.pathname === '/wallet'
              : location.pathname === item.path;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`relative flex flex-col items-center gap-1 px-5 py-1.5 rounded-xl transition-all duration-200
                           ${isActive
                             ? 'text-[#FF6900]'
                             : 'text-gray-500 hover:text-gray-300 active:scale-95'
                           }`}
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
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
