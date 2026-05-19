import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import ShibLogo from '../components/ShibLogo';
import TangemScanModal from '../components/TangemScanModal';
import { useWalletStore } from '../store/walletStore';
import { tangemAvailable } from '../lib/tangem';

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const hasHotVault = useWalletStore((s) => s.hasHotVault);
  const hasTangemAccounts = useWalletStore((s) => s.hasTangemAccounts);
  const setupTangemOnly = useWalletStore((s) => s.setupTangemOnly);
  const unlockTangemOnly = useWalletStore((s) => s.unlockTangemOnly);

  const [showTangemModal, setShowTangemModal] = useState(false);
  const showTangemEntry = tangemAvailable();

  useEffect(() => {
    // Three onboarding states:
    //   1) Hot vault exists → /lock (password required)
    //   2) Tangem-only install exists → unlock automatically + /wallet
    //   3) Neither → stay on this page
    if (hasHotVault()) {
      navigate('/lock', { replace: true });
      return;
    }
    if (hasTangemAccounts()) {
      if (unlockTangemOnly()) {
        navigate('/wallet', { replace: true });
      }
    }
  }, [navigate, hasHotVault, hasTangemAccounts, unlockTangemOnly]);

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

          {showTangemEntry && (
            <button
              onClick={() => setShowTangemModal(true)}
              className="w-full py-4 rounded-2xl font-semibold text-[0.95rem] tracking-wide
                         transition-all duration-300 active:scale-[0.97]
                         flex items-center justify-center gap-2 group
                         hover:shadow-[0_0_25px_rgba(255,184,0,0.18)]"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 184, 0, 0.08) 0%, rgba(255, 105, 0, 0.05) 100%)',
                border: '1px solid rgba(255, 184, 0, 0.25)',
                color: '#FFB800',
              }}
            >
              <CreditCard size={18} className="transition-transform duration-300 group-hover:scale-110" />
              Connect Tangem
            </button>
          )}
        </div>

        {showTangemEntry && (
          <p className="mt-4 text-center text-[10px] text-gray-600 leading-relaxed max-w-[240px]">
            Hardware wallet support — your key never leaves the card.
          </p>
        )}
      </div>

      <TangemScanModal
        open={showTangemModal}
        mode="connect"
        onClose={() => setShowTangemModal(false)}
        onSuccess={(result) => {
          setupTangemOnly({
            address: result.address,
            cardId: result.cardId,
            walletPublicKey: result.walletPublicKey,
            label: `Tangem ••••${result.cardId.slice(-4)}`,
          });
          setShowTangemModal(false);
          navigate('/wallet', { replace: true });
        }}
      />
    </div>
  );
};

export default Onboarding;
