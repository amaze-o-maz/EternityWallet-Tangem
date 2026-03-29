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
    <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-screen animate-fade-in relative overflow-hidden"
      style={{ background: '#0A0A0A' }}
    >
      {/* Deep ambient glow — warm orange, very subtle */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(255, 105, 0, 0.07) 0%, rgba(255, 80, 0, 0.02) 50%, transparent 80%)',
        }}
      />
      {/* Secondary glow — tighter, warmer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 38%, rgba(255, 140, 0, 0.04) 0%, transparent 40%)',
        }}
      />

      <div className="max-w-sm w-full flex flex-col items-center relative z-10">
        {/* Logo with ambient ring glow */}
        <div className="relative mb-14">
          {/* Outer soft glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255, 105, 0, 0.18) 0%, rgba(255, 120, 0, 0.06) 45%, transparent 70%)',
              transform: 'scale(3)',
              filter: 'blur(25px)',
            }}
          />
          {/* Subtle ring highlight */}
          <div
            className="absolute inset-[-6px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, transparent 42%, rgba(255, 105, 0, 0.08) 48%, transparent 55%)',
            }}
          />
          <ShibLogo size={112} animated className="relative z-10 drop-shadow-[0_0_20px_rgba(255,105,0,0.15)]" />
        </div>

        {/* Title — bold, tight, premium */}
        <h1
          className="text-center mb-3 leading-none tracking-tight"
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #FF7A00 0%, #FFB800 50%, #FF6900 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          ShibWallet
        </h1>

        {/* Tagline — clean, confident */}
        <p
          className="text-center mb-16 tracking-wide"
          style={{
            fontSize: '0.85rem',
            color: 'rgba(255, 255, 255, 0.35)',
            fontWeight: 500,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          The Shibarium native wallet
        </p>

        {/* CTA buttons */}
        <div className="w-full space-y-3">
          <button
            onClick={() => navigate('/create')}
            className="w-full py-4 rounded-2xl text-white font-semibold text-[0.95rem] tracking-wide
                       transition-all duration-300 active:scale-[0.97]
                       hover:shadow-[0_0_30px_rgba(255,105,0,0.25)]"
            style={{
              background: 'linear-gradient(135deg, #FF6900 0%, #FF8C00 100%)',
            }}
          >
            Create Wallet
          </button>

          <button
            onClick={() => navigate('/import')}
            className="w-full py-4 rounded-2xl text-white/70 font-semibold text-[0.95rem] tracking-wide
                       transition-all duration-300 active:scale-[0.97]
                       hover:text-white hover:border-white/[0.12] hover:bg-white/[0.04]"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            Import Wallet
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
