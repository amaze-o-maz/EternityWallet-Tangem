import React, { useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';

/** Routes where the global Header is hidden (page provides its own header) */
const NO_HEADER = new Set(['swap']);

const WalletLayout: React.FC = () => {
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const segment = location.pathname.replace(/^\/wallet\/?/, '').split('/')[0];
  const showHeader = !NO_HEADER.has(segment);

  // Scroll to top on every route change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-screen bg-shib-bg relative overflow-hidden">
      {/* Persistent background gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center top, rgba(255, 105, 0, 0.04) 0%, transparent 60%)',
        }}
      />

      {showHeader && <Header />}

      {/* Scrollable content area — persists across navigations */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative z-10">
        <div key={location.pathname} className="animate-page-in min-h-full">
          <Outlet />
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default WalletLayout;
