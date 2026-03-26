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
    <div className="flex-1 flex flex-col items-center justify-center px-6 bg-shib-bg min-h-screen animate-fade-in">
      <div className="max-w-md w-full flex flex-col items-center">
        <ShibLogo size={120} className="mb-8" />

        <h1 className="text-3xl font-bold text-white text-center mb-3">
          Welcome to ShibWallet
        </h1>

        <p className="text-center mb-10" style={{ color: '#A0A0A0' }}>
          The wallet built for the Shib ecosystem
        </p>

        <div className="w-full space-y-3">
          <button
            onClick={() => navigate('/create')}
            className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover
                       text-white font-semibold text-base transition active:scale-95"
          >
            Create New Wallet
          </button>

          <button
            onClick={() => navigate('/import')}
            className="w-full py-3.5 rounded-lg bg-transparent border-2 border-shib-orange
                       text-shib-orange font-semibold text-base hover:bg-shib-orange/10
                       transition active:scale-95"
          >
            Import Existing Wallet
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
