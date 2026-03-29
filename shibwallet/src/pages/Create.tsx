import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { wordlist } from '@scure/bip39/wordlists/english';
import toast from 'react-hot-toast';
import PasswordInput from '../components/PasswordInput';
import { createWallet, encryptMnemonic } from '../lib/wallet';
import { useWalletStore } from '../store/walletStore';

const VAULT_KEY = 'shibwallet_vault';

type Step = 'backup' | 'verify' | 'password';

function pickRandomIndices(count: number, max: number): number[] {
  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * max));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

function pickDecoys(correctWord: string, count: number): string[] {
  const decoys = new Set<string>();
  while (decoys.size < count) {
    const word = wordlist[Math.floor(Math.random() * wordlist.length)];
    if (word !== correctWord) {
      decoys.add(word);
    }
  }
  return Array.from(decoys);
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const Create: React.FC = () => {
  const navigate = useNavigate();
  const setWallet = useWalletStore((s) => s.setWallet);

  const wallet = useMemo(() => createWallet(), []);
  const words = useMemo(() => wallet.mnemonic.split(' '), [wallet.mnemonic]);

  const [step, setStep] = useState<Step>('backup');

  // Verify state
  const verifyIndices = useMemo(() => pickRandomIndices(3, 12), []);
  const verifyOptions = useMemo(
    () =>
      verifyIndices.map((idx) => {
        const correct = words[idx];
        const decoys = pickDecoys(correct, 3);
        return {
          index: idx,
          correct,
          options: shuffleArray([correct, ...decoys]),
        };
      }),
    [verifyIndices, words],
  );
  const [currentVerifyStep, setCurrentVerifyStep] = useState(0);

  // Password state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleVerifySelect = useCallback(
    (selected: string) => {
      const current = verifyOptions[currentVerifyStep];
      if (selected !== current.correct) {
        toast.error(`Wrong word. Word #${current.index + 1} is not "${selected}". Try again.`);
        return;
      }

      if (currentVerifyStep < verifyOptions.length - 1) {
        setCurrentVerifyStep((prev) => prev + 1);
      } else {
        setStep('password');
      }
    },
    [currentVerifyStep, verifyOptions],
  );

  const handleCreatePassword = useCallback(async () => {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const encrypted = encryptMnemonic(wallet.mnemonic, password);
      localStorage.setItem(VAULT_KEY, encrypted);
      setWallet(wallet.address, wallet.privateKey, wallet.mnemonic, password);
      navigate('/wallet', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setSaving(false);
    }
  }, [password, confirmPassword, wallet, setWallet, navigate]);

  return (
    <div className="flex-1 flex flex-col items-center bg-shib-bg min-h-screen py-8 px-5 animate-fade-in relative overflow-hidden">
      {/* Subtle background radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-md w-full relative z-10">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-10">
          {(['backup', 'verify', 'password'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                  i <= ['backup', 'verify', 'password'].indexOf(step)
                    ? 'bg-gradient-to-r from-[#FF6900] to-[#FF8C00] shadow-[0_0_8px_rgba(255,105,0,0.3)]'
                    : 'bg-white/[0.06]'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Step 1: Backup */}
        {step === 'backup' && (
          <div className="animate-slide-up-fade">
            <h1 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
              Your Secret Recovery Phrase
            </h1>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">
              Write down these 12 words in order and store them somewhere safe.
            </p>

            <div className="grid grid-cols-3 gap-2.5 mb-8">
              {words.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-3 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                             transition-all duration-200 hover:bg-white/[0.05] hover:border-white/[0.1]"
                  style={{
                    animation: `slide-up-fade 0.4s ease-out ${i * 40}ms both`,
                  }}
                >
                  <span className="text-xs text-gray-500 w-5 text-right font-mono">{i + 1}.</span>
                  <span className="text-sm text-white font-medium">{word}</span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-amber-500/20 p-5 mb-8
                            shadow-[0_0_20px_rgba(255,184,0,0.05)]">
              <p className="text-sm text-amber-300/90 leading-relaxed">
                Never share your secret phrase. Anyone with these words owns your wallet.
              </p>
            </div>

            <button
              onClick={() => setStep('verify')}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)] hover:scale-[1.01]"
            >
              I've Written It Down &rarr; Continue
            </button>
          </div>
        )}

        {/* Step 2: Verify */}
        {step === 'verify' && (
          <div className="animate-slide-up-fade">
            <h1 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
              Verify Your Phrase
            </h1>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">
              Select the correct word for each position to confirm you saved your phrase.
            </p>

            <div className="mb-8">
              <p className="text-sm text-gray-500 mb-1.5">
                Question {currentVerifyStep + 1} of {verifyOptions.length}
              </p>
              <p className="text-lg text-white font-semibold mb-6">
                What is word #{verifyOptions[currentVerifyStep].index + 1}?
              </p>

              <div className="grid grid-cols-2 gap-3">
                {verifyOptions[currentVerifyStep].options.map((option, i) => (
                  <button
                    key={option}
                    onClick={() => handleVerifySelect(option)}
                    className="py-3.5 px-4 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                               text-white text-sm font-medium transition-all duration-200 active:scale-[0.97]
                               hover:border-[#FF6900]/40 hover:bg-white/[0.06]
                               hover:shadow-[0_0_15px_rgba(255,105,0,0.1)]"
                    style={{
                      animation: `slide-up-fade 0.3s ease-out ${i * 60}ms both`,
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Password */}
        {step === 'password' && (
          <div className="animate-slide-up-fade">
            <h1 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
              Set a Password
            </h1>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">
              This password encrypts your wallet on this device. Minimum 8 characters.
            </p>

            <div className="space-y-5 mb-8">
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <label className="block text-sm text-gray-400 mb-2 font-medium">Password</label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder="Enter password"
                  showStrength
                />
              </div>
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <label className="block text-sm text-gray-400 mb-2 font-medium">Confirm Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm password"
                />
              </div>
            </div>

            <button
              onClick={handleCreatePassword}
              disabled={saving || password.length < 8 || password !== confirmPassword}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {saving ? 'Creating Wallet...' : 'Create Wallet'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Create;
