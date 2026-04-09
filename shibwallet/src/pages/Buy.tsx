import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, ArrowRight } from 'lucide-react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useWalletStore } from '../store/walletStore';

interface OnrampOption {
  token: string;
  name: string;
  network: string;
  color: string;
  logoUrl: string;
  url: string;
}

const ONRAMP_OPTIONS: OnrampOption[] = [
  {
    token: 'SHIB',
    name: 'Shiba Inu',
    network: 'Ethereum',
    color: '#FFA409',
    logoUrl: 'https://assets.coingecko.com/coins/images/11939/standard/shiba.png',
    url: 'https://changenow.io/exchange?from=usd&to=shib&fiatMode=true',
  },
  {
    token: 'BONE',
    name: 'Bone ShibaSwap',
    network: 'Shibarium',
    color: '#E8433E',
    logoUrl: 'https://assets.coingecko.com/coins/images/16916/standard/bone_icon.png',
    url: 'https://changenow.io/exchange?from=usd&to=bone&fiatMode=true',
  },
];

const Buy: React.FC = () => {
  const navigate = useNavigate();
  const { isUnlocked } = useWalletStore();

  if (!isUnlocked) return null;

  const handleBuy = (option: OnrampOption) => {
    navigate(`/wallet/browser?url=${encodeURIComponent(option.url)}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-shib-bg animate-fade-in relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <Header />

      <main className="flex-1 max-w-md mx-auto w-full px-5 pt-6 pb-24 relative z-10">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
            Buy Crypto
          </h1>
          <p className="text-[11px] text-gray-500 mt-0.5">Purchase tokens with credit card, bank transfer, or Apple Pay</p>
        </div>

        {/* Provider badge */}
        <div className="flex items-center gap-2 px-4 py-2.5 mb-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="w-5 h-5 rounded-full bg-[#00C26F]/15 flex items-center justify-center">
            <CreditCard size={11} className="text-[#00C26F]" />
          </div>
          <span className="text-xs text-gray-400">Powered by</span>
          <span className="text-xs text-white font-semibold">ChangeNOW</span>
          <span className="ml-auto text-[10px] text-gray-600">No account required</span>
        </div>

        {/* Token cards */}
        <div className="space-y-3">
          {ONRAMP_OPTIONS.map((option, i) => (
            <button
              key={option.token}
              onClick={() => handleBuy(option)}
              className="w-full group"
              style={{ animation: `slide-up-fade 0.4s ease-out ${i * 60}ms both` }}
            >
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]
                              hover:border-[#FF6900]/20 hover:shadow-[0_0_20px_rgba(255,105,0,0.06)]
                              transition-all duration-300 active:scale-[0.98]">
                {/* Token icon */}
                <div className="relative">
                  <div
                    className="absolute inset-0 rounded-full blur-lg opacity-30"
                    style={{ backgroundColor: option.color }}
                  />
                  <img
                    src={option.logoUrl}
                    alt={option.token}
                    className="w-12 h-12 rounded-full relative z-10 border-2 border-white/[0.08]"
                    loading="lazy"
                  />
                </div>

                {/* Token info */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white">{option.token}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.06] text-gray-400">
                      {option.network}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{option.name}</p>
                </div>

                {/* Arrow */}
                <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center
                                group-hover:bg-[#FF6900]/10 transition-colors">
                  <ArrowRight size={14} className="text-gray-400 group-hover:text-[#FF6900] transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Info section */}
        <div className="mt-6 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
          <h3 className="text-xs font-semibold text-gray-300 mb-2">How it works</h3>
          <div className="space-y-2.5">
            {[
              { step: '1', text: 'Choose a token above' },
              { step: '2', text: 'Enter amount and select payment method' },
              { step: '3', text: 'Complete purchase — tokens sent directly to your wallet' },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#FF6900]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-[#FF6900]">{item.step}</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

      </main>

      <BottomNav />
    </div>
  );
};

export default Buy;
