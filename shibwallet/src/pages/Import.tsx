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
  hashPassword,
} from '../lib/wallet';
import { useWalletStore } from '../store/walletStore';

const VAULT_KEY = 'shibwallet_vault';
const HASH_KEY = 'shibwallet_hash';

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
      if (!trimmed.startsWith('0x') || trimmed.length !== 66) {
        toast.error('Private key must be a 66-character hex string starting with 0x');
        return;
      }
      try {
        const wallet = deriveFromPrivateKey(trimmed);
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
      const hashed = hashPassword(password);
      // For mnemonic imports, encrypt the mnemonic
      // For private key imports, prefix with 'pk:' and encrypt the private key
      const dataToEncrypt = importedMnemonic ?? `pk:${importedPrivateKey}`;
      const encrypted = encryptMnemonic(dataToEncrypt, hashed);
      localStorage.setItem(VAULT_KEY, encrypted);
      localStorage.setItem(HASH_KEY, hashed);
      setWallet(importedAddress, importedPrivateKey, importedMnemonic ?? '');
      navigate('/wallet', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import wallet');
    } finally {
      setSaving(false);
    }
  }, [password, confirmPassword, importedAddress, importedPrivateKey, importedMnemonic, setWallet, navigate]);

  return (
    <div className="flex-1 flex flex-col items-center bg-shib-bg min-h-screen py-8 px-4 animate-fade-in">
      <div className="max-w-md w-full">
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
          className="text-sm text-gray-400 hover:text-white transition-colors mb-6 active:scale-95"
        >
          &larr; Back
        </button>

        {!showPasswordStep ? (
          <div className="animate-fade-in">
            <h1 className="text-2xl font-bold text-white mb-6">Import Wallet</h1>

            {/* Tabs */}
            <div className="flex rounded-lg bg-shib-surface border border-shib-border mb-6 overflow-hidden">
              <button
                onClick={() => setTab('mnemonic')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === 'mnemonic'
                    ? 'bg-shib-orange text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Mnemonic Phrase
              </button>
              <button
                onClick={() => setTab('privatekey')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === 'privatekey'
                    ? 'bg-shib-orange text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Private Key
              </button>
            </div>

            {tab === 'mnemonic' ? (
              <div className="mb-8">
                <label className="block text-sm text-gray-400 mb-1.5">
                  Enter your 12-word recovery phrase
                </label>
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => setMnemonicInput(e.target.value)}
                  placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg bg-shib-surface border border-shib-border
                             text-white placeholder-gray-600 focus:outline-none focus:border-shib-orange
                             transition-colors resize-none text-sm leading-relaxed"
                />
              </div>
            ) : (
              <div className="mb-8">
                <label className="block text-sm text-gray-400 mb-1.5">
                  Enter your private key (0x-prefixed)
                </label>
                <input
                  type="password"
                  value={privateKeyInput}
                  onChange={(e) => setPrivateKeyInput(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3 rounded-lg bg-shib-surface border border-shib-border
                             text-white placeholder-gray-600 focus:outline-none focus:border-shib-orange
                             transition-colors text-sm font-mono"
                />
              </div>
            )}

            <button
              onClick={handleValidateAndProceed}
              className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover
                         text-white font-semibold transition active:scale-95"
            >
              Continue
            </button>
          </div>
        ) : (
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
              onClick={handleSetPassword}
              disabled={saving || password.length < 8 || password !== confirmPassword}
              className="w-full py-3.5 rounded-lg bg-shib-orange hover:bg-shib-orange-hover
                         text-white font-semibold transition active:scale-95
                         disabled:opacity-40 disabled:cursor-not-allowed"
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
