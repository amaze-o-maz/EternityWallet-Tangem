import React, { useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';
import { useAutoLockOnResume } from '../hooks/useAutoLockOnResume';

/** Routes where the global Header is hidden (page provides its own header) */
const NO_HEADER = new Set<string>();

const WalletLayout: React.FC = () => {
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const segment = location.pathname.replace(/^\/wallet\/?/, '').split('/')[0];
  const showHeader = !NO_HEADER.has(segment);

  // Scroll to top on every route change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  useAutoLockOnResume();

  return (
    <div className="safe-top flex flex-col h-screen bg-shib-bg relative overflow-hidden">
      {/* Persistent background gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center top, var(--shib-glow) 0%, transparent 60%)',
        }}
      />

      {showHeader && <Header />}

      {/* Scrollable content area — persists across navigations.
           No z-index here to avoid creating a stacking context that would
           trap fixed modals (z-50) below the BottomNav (z-40). */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto relative">
        <div key={location.pathname} className="animate-page-in min-h-full">
          <Outlet />
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default WalletLayout;
