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
    <div
      className="safe-top flex-1 flex flex-col items-center justify-center px-6 min-h-screen animate-fade-in relative overflow-hidden"
      style={{ background: '#0A0A0A' }}
    >
      {/* Deep ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(255, 105, 0, 0.08) 0%, rgba(255, 80, 0, 0.02) 50%, transparent 80%)',
        }}
      />

      <div className="max-w-sm w-full flex flex-col items-center relative z-10">
        {/* Logo — no clipping, generous padding for ears */}
        <div className="relative mb-12" style={{ width: 140, height: 140 }}>
          {/* Ambient glow behind logo */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: '50%',
              left: '50%',
              width: 280,
              height: 280,
              transform: 'translate(-50%, -50%)',
              background:
                'radial-gradient(circle, rgba(255, 105, 0, 0.15) 0%, rgba(255, 120, 0, 0.04) 50%, transparent 70%)',
              filter: 'blur(20px)',
            }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <ShibLogo
              size={120}
              animated
              className="drop-shadow-[0_0_24px_rgba(255,105,0,0.12)]"
            />
          </div>
        </div>

        {/* Title */}
        <h1
          className="text-center mb-4 leading-none"
          style={{
            fontSize: '2.25rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            background:
              'linear-gradient(135deg, #FF7A00 0%, #FFB800 50%, #FF6900 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          ShibWallet
        </h1>

        {/* Tagline — from brand research, rank #2 */}
        <p
          className="text-center mb-16"
          style={{
            fontSize: '0.8rem',
            color: 'rgba(255, 255, 255, 0.4)',
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          Shibarium unlocked.
        </p>

        {/* CTA buttons */}
        <div className="w-full space-y-3">
          <button
            onClick={() => navigate('/create')}
            className="w-full py-4 rounded-2xl text-white font-bold text-[0.95rem] tracking-wide
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
            className="w-full py-4 rounded-2xl text-white/60 font-semibold text-[0.95rem] tracking-wide
                       transition-all duration-300 active:scale-[0.97]
                       hover:text-white hover:border-white/[0.12] hover:bg-white/[0.04]"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
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
