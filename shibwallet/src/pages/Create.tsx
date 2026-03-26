import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { wordlist } from '@scure/bip39/wordlists/english';
import toast from 'react-hot-toast';
import PasswordInput from '../components/PasswordInput';
import { createWallet, encryptMnemonic, hashPassword } from '../lib/wallet';
import { useWalletStore } from '../store/walletStore';

const VAULT_KEY = 'shibwallet_vault';
const HASH_KEY = 'shibwallet_hash';

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
      const hashed = hashPassword(password);
      const encrypted = encryptMnemonic(wallet.mnemonic, hashed);
      localStorage.setItem(VAULT_KEY, encrypted);
      localStorage.setItem(HASH_KEY, hashed);
      setWallet(wallet.address, wallet.privateKey, wallet.mnemonic);
      navigate('/wallet', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setSaving(false);
    }
  }, [password, confirmPassword, wallet, setWallet, navigate]);

  return (
    <div className="flex-1 flex flex-col items-center bg-shib-bg min-h-screen py-8 px-4 animate-fade-in">
      <div className="max-w-md w-full">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(['backup', 'verify', 'password'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= ['backup', 'verify', 'password'].indexOf(step)
                    ? 'bg-shib-orange'
                    : 'bg-shib-border'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Step 1: Backup */}
        {step === 'backup' && (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold text-white mb-2">Your Secret Recovery Phrase</h1>
            <p className="text-sm text-gray-400 mb-6">
              Write down these 12 words in order and store them somewhere safe.
            </p>

            <div className="grid grid-cols-3 gap-2 mb-6">
              {words.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-shib-surface border border-shib-border"
                >
                  <span className="text-xs text-gray-500 w-5 text-right">{i + 1}.</span>
                  <span className="text-sm text-white font-medium">{word}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-yellow-600/40 bg-yellow-900/20 p-4 mb-8">
              <p className="text-sm text-yellow-300 leading-relaxed">
                Never share your secret phrase. Anyone with these words owns your wallet.
              </p>
            </div>

            <button
              onClick={() => setStep('verify')}
              className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover
                         text-white font-semibold transition active:scale-95"
            >
              I've Written It Down &rarr; Continue
            </button>
          </div>
        )}

        {/* Step 2: Verify */}
        {step === 'verify' && (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold text-white mb-2">Verify Your Phrase</h1>
            <p className="text-sm text-gray-400 mb-6">
              Select the correct word for each position to confirm you saved your phrase.
            </p>

            <div className="mb-8">
              <p className="text-sm text-gray-400 mb-1">
                Question {currentVerifyStep + 1} of {verifyOptions.length}
              </p>
              <p className="text-lg text-white font-semibold mb-4">
                What is word #{verifyOptions[currentVerifyStep].index + 1}?
              </p>

              <div className="grid grid-cols-2 gap-3">
                {verifyOptions[currentVerifyStep].options.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleVerifySelect(option)}
                    className="py-3 px-4 rounded-lg bg-shib-surface border border-shib-border
                               text-white text-sm font-medium hover:border-shib-orange
                               hover:bg-shib-surface-alt transition active:scale-95"
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
          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold text-white mb-2">Set a Password</h1>
            <p className="text-sm text-gray-400 mb-6">
              This password encrypts your wallet on this device. Minimum 8 characters.
            </p>

            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Password</label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder="Enter password"
                  showStrength
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Confirm Password</label>
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
              className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover
                         text-white font-semibold transition active:scale-95
                         disabled:opacity-40 disabled:cursor-not-allowed"
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
