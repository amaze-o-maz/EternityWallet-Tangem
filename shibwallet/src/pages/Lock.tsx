import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ShibLogo from '../components/ShibLogo';
import PasswordInput from '../components/PasswordInput';
import { useWalletStore } from '../store/walletStore';

const VAULT_KEY = 'shibwallet_vault';

const Lock: React.FC = () => {
  const navigate = useNavigate();
  const { unlock, isUnlocked } = useWalletStore();
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(VAULT_KEY)) {
      navigate('/', { replace: true });
      return;
    }
    if (isUnlocked) {
      navigate('/wallet', { replace: true });
    }
  }, [navigate, isUnlocked]);

  const handleUnlock = useCallback(async () => {
    if (!password) {
      toast.error('Please enter your password');
      return;
    }

    setUnlocking(true);
    try {
      unlock(password);
      navigate('/wallet', { replace: true });
    } catch {
      toast.error('Wrong password. Please try again.');
    } finally {
      setUnlocking(false);
    }
  }, [password, unlock, navigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleUnlock();
      }
    },
    [handleUnlock],
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 bg-shib-bg min-h-screen animate-fade-in">
      <div className="max-w-md w-full flex flex-col items-center">
        <ShibLogo size={96} className="mb-6" />

        <h1 className="text-xl font-bold text-white mb-8">ShibWallet is locked</h1>

        <div className="w-full mb-6" onKeyDown={handleKeyDown}>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
          />
        </div>

        <button
          onClick={handleUnlock}
          disabled={unlocking || !password}
          className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover
                     text-white font-semibold transition active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {unlocking ? 'Unlocking...' : 'Unlock'}
        </button>
      </div>
    </div>
  );
};

export default Lock;
