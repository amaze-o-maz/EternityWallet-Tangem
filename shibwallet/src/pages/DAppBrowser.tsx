import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  X,
  Shield,
  ExternalLink,
  Globe,
  Lock,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { getNetworkByChainId } from '../lib/chains';
import { isNativePlatform, openNativeDAppBrowser, markBrowserOpen } from '../lib/dappBrowser';
import { useAutoLockOnResume } from '../hooks/useAutoLockOnResume';

const DAppBrowser: React.FC = () => {
  const navigate = useNavigate();
  useAutoLockOnResume();
  const [searchParams] = useSearchParams();
  const initialUrl = searchParams.get('url') || 'https://shibaswap.com';

  const { address, privateKey } = useWalletStore();
  const activeAccount = useWalletStore((s) => s.activeAccount());
  const isTangem = activeAccount?.kind === 'tangem';
  const chainId = useNetworkStore((s) => s.chainId);
  const network = getNetworkByChainId(chainId);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pageTitle, setPageTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [showConnInfo, setShowConnInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSecure, setIsSecure] = useState(true);

  // On native, launch the native WebView browser with Web3 injection.
  // TODO(v2): the native browser plugin currently takes a raw privateKey;
  // wiring it to forward signing back through JS for NFC requires a bigger
  // refactor. For v1, Tangem users get the iframe browser instead — works
  // for read-only pages (explorers, news) but dApps can't sign in there.
  useEffect(() => {
    if (isTangem) {
      // Stay on the iframe browser. No native WebView, no signing context.
      return;
    }
    if (isNativePlatform() && address && privateKey) {
      markBrowserOpen();
      openNativeDAppBrowser({
        url: initialUrl,
        address,
        privateKey,
        chainId,
        rpcUrl: network?.rpcUrl || 'https://www.shibrpc.com',
      });
      navigate(-1);
    }
  }, []);

  const navigateTo = useCallback((newUrl: string) => {
    let formatted = newUrl.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      if (formatted.includes('.') && !formatted.includes(' ')) {
        formatted = 'https://' + formatted;
      } else {
        formatted = 'https://www.google.com/search?q=' + encodeURIComponent(formatted);
      }
    }
    setUrl(formatted);
    setInputUrl(formatted);
    setLoading(true);
    setError(false);
    setIsSecure(formatted.startsWith('https://'));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(inputUrl);
  };

  const refresh = () => {
    setLoading(true);
    setError(false);
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  };

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  // If native platform AND we're not a Tangem user, the native WebView is taking over
  // and we don't render anything. Tangem users keep the iframe browser.
  if (isNativePlatform() && !isTangem) return null;

  return (
    <div className="safe-top flex flex-col h-screen bg-shib-bg animate-fade-in">
      {/* Top bar */}
      <div className="shrink-0 bg-[#0D0D0D]/95 backdrop-blur-2xl border-b border-white/[0.06] z-30">
        {/* Navigation row */}
        <div className="flex items-center gap-1.5 px-3 py-2">
          <button
            onClick={() => navigate('/wallet/dapps')}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90"
            title="Close browser"
          >
            <X size={18} />
          </button>

          <button
            onClick={() => {
              if (iframeRef.current) {
                try {
                  window.history.back();
                } catch {}
              }
            }}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90"
          >
            <ArrowLeft size={18} />
          </button>

          <button
            onClick={() => {
              try {
                window.history.forward();
              } catch {}
            }}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90"
          >
            <ArrowRight size={18} />
          </button>

          {/* URL bar */}
          <form onSubmit={handleSubmit} className="flex-1 min-w-0">
            <div className="relative flex items-center">
              <div className="absolute left-3 text-gray-500">
                {isSecure ? <Lock size={12} /> : <AlertTriangle size={12} className="text-yellow-500" />}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08]
                           text-white text-xs placeholder-gray-600 truncate
                           focus:border-[#FF6900]/50 transition-all"
                placeholder="Search or enter URL"
              />
            </div>
          </form>

          {loading ? (
            <button
              onClick={() => setLoading(false)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              onClick={refresh}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90"
            >
              <RotateCw size={16} />
            </button>
          )}

          <button
            onClick={() => setShowConnInfo(!showConnInfo)}
            className={`p-2 rounded-lg transition-all active:scale-90
                       ${showConnInfo ? 'text-[#FF6900] bg-[#FF6900]/10' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'}`}
            title="Wallet connection"
          >
            <Shield size={16} />
          </button>
        </div>

        {/* Loading bar */}
        {loading && (
          <div className="h-0.5 bg-white/[0.03] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#FF6900] to-[#FFB800] rounded-full"
              style={{
                animation: 'browser-loading 1.5s ease-in-out infinite',
                width: '40%',
              }}
            />
          </div>
        )}

        {/* Connection info panel */}
        {showConnInfo && (
          <div className="px-3 py-3 border-t border-white/[0.06] animate-slide-up-fade">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-300 font-medium">Connected to {hostname}</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Wallet</p>
                  <p className="text-xs text-white font-mono mt-0.5">
                    {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : 'Not connected'}
                  </p>
                </div>
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/[0.03] rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Network</p>
                  <p className="text-xs text-white font-medium mt-0.5">{network?.name ?? 'Unknown'}</p>
                </div>
                <div className="flex-1 bg-white/[0.03] rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Chain ID</p>
                  <p className="text-xs text-white font-medium mt-0.5">{chainId}</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                On Android APK, dApps auto-connect via injected Web3 provider. On web, manually connect using your address above.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Browser content */}
      <div className="flex-1 relative bg-white">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full bg-shib-bg px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
              <Globe size={28} className="text-gray-500" />
            </div>
            <h3 className="text-white text-base font-semibold mb-1">Can't load this page</h3>
            <p className="text-gray-500 text-xs mb-4 max-w-[260px]">
              This site may block embedding. Try opening it externally or use the Android APK for full dApp browser support.
            </p>
            <div className="flex gap-3">
              <button onClick={refresh} className="btn-secondary text-xs px-4 py-2">
                Retry
              </button>
              <button onClick={openExternal} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                <ExternalLink size={12} />
                Open External
              </button>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            allow="clipboard-write"
            title="dApp Browser"
            onLoad={() => {
              setLoading(false);
              setError(false);
            }}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        )}

        {/* Overlay loading shimmer */}
        {loading && !error && (
          <div className="absolute inset-0 bg-shib-bg flex flex-col items-center justify-center z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.06] animate-pulse-glow flex items-center justify-center mb-4">
              <Globe size={24} className="text-[#FF6900]" />
            </div>
            <p className="text-gray-400 text-sm font-medium">Loading {hostname}...</p>
            <div className="mt-4 w-48 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF6900] to-[#FFB800] rounded-full"
                style={{
                  animation: 'browser-loading 1.5s ease-in-out infinite',
                  width: '60%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar with quick info */}
      <div className="shrink-0 bg-[#0D0D0D]/95 backdrop-blur-2xl border-t border-white/[0.06] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={12} className="text-gray-500 shrink-0" />
          <span className="text-[11px] text-gray-500 truncate">{hostname}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigateTo('https://shibaswap.com')}
            className="text-[10px] text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-white/[0.06] transition-all"
          >
            ShibaSwap
          </button>
          <button
            onClick={openExternal}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DAppBrowser;
