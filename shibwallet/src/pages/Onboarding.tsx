import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ShibLogo from '../components/ShibLogo';

const VAULT_KEY = 'shibwallet_vault';

const Onboarding: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem(VAULT_KEY)) {
      navigate('/lock', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 bg-shib-bg min-h-screen animate-fade-in relative overflow-hidden">
      {/* Subtle background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255, 105, 0, 0.06) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md w-full flex flex-col items-center relative z-10">
        {/* Animated glow orb behind logo */}
        <div className="relative mb-10">
          <div
            className="absolute inset-0 animate-pulse-glow"
            style={{
              background: 'radial-gradient(circle, rgba(255, 105, 0, 0.25) 0%, rgba(255, 140, 0, 0.08) 40%, transparent 70%)',
              transform: 'scale(2.5)',
              filter: 'blur(30px)',
            }}
          />
          <ShibLogo size={140} animated className="relative z-10" />
        </div>

        <h1 className="text-4xl font-bold text-center mb-3 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
          Welcome to ShibWallet
        </h1>

        <p className="text-center mb-12 text-gray-400 text-base leading-relaxed">
          The wallet built for the Shib ecosystem
        </p>

        <div className="w-full space-y-4">
          <button
            onClick={() => navigate('/create')}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                       text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                       hover:shadow-[0_0_25px_rgba(255,105,0,0.3)] hover:scale-[1.01]"
          >
            Create New Wallet
          </button>

          <button
            onClick={() => navigate('/import')}
            className="w-full py-4 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                       text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                       hover:bg-white/[0.06] hover:border-[#FF6900]/30"
          >
            Import Existing Wallet
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
