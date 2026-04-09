import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import toast from 'react-hot-toast';
import PasswordInput from '../components/PasswordInput';
import {
  deriveFromMnemonic,
  deriveFromPrivateKey,
  encryptMnemonic,
} from '../lib/wallet';
import { useWalletStore } from '../store/walletStore';

const VAULT_KEY = 'shibwallet_vault';

type Tab = 'mnemonic' | 'privatekey';

const Import: React.FC = () => {
  const navigate = useNavigate();
  const setWallet = useWalletStore((s) => s.setWallet);

  const [tab, setTab] = useState<Tab>('mnemonic');
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [showPasswordStep, setShowPasswordStep] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Validated data held between steps
  const [importedAddress, setImportedAddress] = useState('');
  const [importedPrivateKey, setImportedPrivateKey] = useState('');
  const [importedMnemonic, setImportedMnemonic] = useState<string | null>(null);

  const handleValidateAndProceed = useCallback(() => {
    if (tab === 'mnemonic') {
      const trimmed = mnemonicInput.trim().toLowerCase().replace(/\s+/g, ' ');
      const wordCount = trimmed.split(' ').length;
      if (wordCount !== 12) {
        toast.error('Please enter exactly 12 words');
        return;
      }
      if (!validateMnemonic(trimmed, wordlist)) {
        toast.error('Invalid mnemonic phrase. Please check your words.');
        return;
      }
      try {
        const wallet = deriveFromMnemonic(trimmed);
        setImportedAddress(wallet.address);
        setImportedPrivateKey(wallet.privateKey);
        setImportedMnemonic(trimmed);
        setShowPasswordStep(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Invalid mnemonic');
      }
    } else {
      const trimmed = privateKeyInput.trim();
      const isHex64 = /^[0-9a-fA-F]{64}$/.test(trimmed);
      const isHex66 = /^0x[0-9a-fA-F]{64}$/.test(trimmed);
      if (!isHex64 && !isHex66) {
        toast.error('Private key must be 64 hex characters (with or without 0x prefix)');
        return;
      }
      const keyWithPrefix = isHex64 ? `0x${trimmed}` : trimmed;
      try {
        const wallet = deriveFromPrivateKey(keyWithPrefix);
        setImportedAddress(wallet.address);
        setImportedPrivateKey(wallet.privateKey);
        setImportedMnemonic(null);
        setShowPasswordStep(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Invalid private key');
      }
    }
  }, [tab, mnemonicInput, privateKeyInput]);

  const handleSetPassword = useCallback(async () => {
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
      const dataToEncrypt = importedMnemonic ?? `pk:${importedPrivateKey}`;
      const encrypted = encryptMnemonic(dataToEncrypt, password);
      localStorage.setItem(VAULT_KEY, encrypted);
      setWallet(importedAddress, importedPrivateKey, importedMnemonic ?? '', password);
      navigate('/wallet', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import wallet');
    } finally {
      setSaving(false);
    }
  }, [password, confirmPassword, importedAddress, importedPrivateKey, importedMnemonic, setWallet, navigate]);

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
        <button
          onClick={() => {
            if (showPasswordStep) {
              setShowPasswordStep(false);
              setPassword('');
              setConfirmPassword('');
            } else {
              navigate('/');
            }
          }}
          className="text-sm text-gray-400 hover:text-white transition-colors mb-8 active:scale-95
                     flex items-center gap-1"
        >
          &larr; Back
        </button>

        {!showPasswordStep ? (
          <div className="animate-slide-up-fade">
            <h1 className="text-2xl font-bold mb-8 bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
              Import Wallet
            </h1>

            {/* Tabs */}
            <div className="flex rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] mb-8 overflow-hidden p-1">
              <button
                onClick={() => setTab('mnemonic')}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                  tab === 'mnemonic'
                    ? 'bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-white shadow-[0_0_15px_rgba(255,105,0,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Mnemonic Phrase
              </button>
              <button
                onClick={() => setTab('privatekey')}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                  tab === 'privatekey'
                    ? 'bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-white shadow-[0_0_15px_rgba(255,105,0,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Private Key
              </button>
            </div>

            {tab === 'mnemonic' ? (
              <div className="mb-8">
                <label className="block text-sm text-gray-400 mb-2 font-medium">
                  Enter your 12-word recovery phrase
                </label>
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => setMnemonicInput(e.target.value)}
                  placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
                  rows={4}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                             text-white placeholder-gray-600 focus:outline-none
                             focus:border-[#FF6900]/50 focus:shadow-[0_0_20px_rgba(255,105,0,0.12)]
                             transition-all duration-300 resize-none text-sm leading-relaxed"
                />
              </div>
            ) : (
              <div className="mb-8">
                <label className="block text-sm text-gray-400 mb-2 font-medium">
                  Enter your private key (0x-prefixed)
                </label>
                <input
                  type="password"
                  value={privateKeyInput}
                  onChange={(e) => setPrivateKeyInput(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]
                             text-white placeholder-gray-600 focus:outline-none
                             focus:border-[#FF6900]/50 focus:shadow-[0_0_20px_rgba(255,105,0,0.12)]
                             transition-all duration-300 text-sm font-mono"
                />
              </div>
            )}

            <button
              onClick={handleValidateAndProceed}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)] hover:scale-[1.01]"
            >
              Continue
            </button>
          </div>
        ) : (
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
              onClick={handleSetPassword}
              disabled={saving || password.length < 8 || password !== confirmPassword}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FF6900] to-[#FF8C00]
                         text-white font-semibold text-base transition-all duration-300 active:scale-[0.97]
                         hover:shadow-[0_0_25px_rgba(255,105,0,0.3)]
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {saving ? 'Importing...' : 'Import Wallet'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Import;
