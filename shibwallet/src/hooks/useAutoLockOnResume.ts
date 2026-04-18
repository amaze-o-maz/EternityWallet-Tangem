import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletStore } from '../store/walletStore';

/** Grace period: ignore momentary visibility hiccups (system dialogs,
 *  keyboard show/hide on some ROMs). Home-button / app-switch pauses last
 *  well beyond this, so real backgrounding still locks on resume. */
const LOCK_GRACE_MS = 800;

/**
 * Auto-lock the wallet when the user returns to the app after backgrounding
 * it (home button, app switcher, screen off, etc.).
 *
 * In-flight sends/swaps keep running because the Viem account object is
 * captured in a closure before any `await` — locking only clears UI state
 * (privateKey, isUnlocked, accounts). The pending transaction completes
 * and is recorded in the transaction store; the user will see it once they
 * unlock.
 *
 * Safe to use in multiple components at once — each instance tracks its own
 * hidden-at timestamp and no-ops when the wallet is already locked.
 */
export function useAutoLockOnResume() {
  const navigate = useNavigate();

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt === 0) return;
      const elapsed = Date.now() - hiddenAt;
      hiddenAt = 0;
      if (elapsed < LOCK_GRACE_MS) return;
      const { isUnlocked, lock } = useWalletStore.getState();
      if (isUnlocked) {
        lock();
        navigate('/lock', { replace: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [navigate]);
}
