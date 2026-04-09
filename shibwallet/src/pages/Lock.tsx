import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ShibLogo from '../components/ShibLogo';
import PasswordInput from '../components/PasswordInput';
import { useWalletStore } from '../store/walletStore';

const VAULT_KEY = 'shibwallet_vault';
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000; // 2s base for exponential backoff

const Lock: React.FC = () => {
  const navigate = useNavigate();
  const { unlock, isUnlocked } = useWalletStore();
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!localStorage.getItem(VAULT_KEY)) {
      navigate('/', { replace: true });
      return;
    }
    if (isUnlocked) {
      navigate('/wallet', { replace: true });
    }
  }, [navigate, isUnlocked]);

  // Countdown timer for lockout
  useEffect(() => {
    if (lockedUntil && lockedUntil > Date.now()) {
      const updateCountdown = () => {
        const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockedUntil(null);
          setCountdown(0);
          if (timerRef.current) clearInterval(timerRef.current);
        } else {
          setCountdown(remaining);
        }
      };
      updateCountdown();
      timerRef.current = setInterval(updateCountdown, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [lockedUntil]);

  const isLockedOut = lockedUntil !== null && lockedUntil > Date.now();

  const handleUnlock = useCallback(async () => {
    if (!password) {
      toast.error('Please enter your password');
      return;
    }

    if (isLockedOut) {
      toast.error(`Too many attempts. Wait ${countdown}s`);
      return;
    }

    setUnlocking(true);
    try {
      unlock(password);
      setFailedAttempts(0);
      navigate('/wallet', { replace: true });
    } catch {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);

      if (attempts >= MAX_ATTEMPTS) {
        // Exponential backoff: 2^(attempts - MAX_ATTEMPTS) * BASE_DELAY
        const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempts - MAX_ATTEMPTS), 300_000); // max 5min
        setLockedUntil(Date.now() + delayMs);
        toast.error(`Too many failed attempts. Locked for ${Math.ceil(delayMs / 1000)}s`);
      } else {
        const remaining = MAX_ATTEMPTS - attempts;
        toast.error(`Wrong password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      }
    } finally {
      setUnlocking(false);
    }
  }, [password, unlock, navigate, failedAttempts, isLockedOut, countdown]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleUnlock();
      }
    },
    [handleUnlock],
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 bg-shib-bg min-h-screen animate-fade-in relative overflow-hidden">
      {/* Background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255, 105, 0, 0.06) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md w-full flex flex-col items-center relative z-10">
        {/* Logo with glow orb */}
        <div className="relative mb-8">
          <div
            className="absolute inset-0 animate-pulse-glow"
            style={{
              background: 'radial-gradient(circle, rgba(255, 105, 0, 0.25) 0%, rgba(255, 140, 0, 0.08) 40%, transparent 70%)',
              transform: 'scale(2.5)',
              filter: 'blur(30px)',
            }}
          />
          <ShibLogo size={110} animated className="relative z-10" />
        </div>

        <h1 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
          ShibWallet is locked
        </h1>
        <p className="text-gray-500 text-sm mb-8">Enter your password to continue</p>

        {isLockedOut && (
          <div className="w-full mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-center">
            <p className="text-red-400 text-sm font-medium">
              Too many failed attempts. Try again in {countdown}s
            </p>
          </div>
        )}

        <div className="w-full mb-6 bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5" onKeyDown={handleKeyDown}>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
          />
        </div>

        <button
          onClick={handleUnlock}
          disabled={unlocking || !password || isLockedOut}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                     text-white font-semibold transition-all duration-300 active:scale-[0.97]
                     hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
        >
          {unlocking ? 'Unlocking...' : isLockedOut ? `Locked (${countdown}s)` : 'Unlock'}
        </button>
      </div>
    </div>
  );
};

export default Lock;
