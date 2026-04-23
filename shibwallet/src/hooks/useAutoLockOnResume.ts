import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletStore } from '../store/walletStore';
import { consumeBrowserOpen } from '../lib/dappBrowser';

const LOCK_GRACE_MS = 800;

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
      // Returning from the native dApp browser — don't lock
      if (consumeBrowserOpen()) {
        useWalletStore.getState().resetLastActivity();
        return;
      }
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
