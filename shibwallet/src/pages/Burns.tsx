import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  formatUnits,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  Flame,
  TrendingDown,
  Trophy,
  Crown,
  Medal,
  Zap,
  ExternalLink,
  X,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useWalletStore } from '../store/walletStore';
import { useNetworkStore } from '../store/networkStore';
import { useBurnStore } from '../store/burnStore';
import { useTransactionStore } from '../store/transactionStore';
import { ERC20_ABI } from '../lib/abis';
import { getNetworkByChainId } from '../lib/chains';
import {
  SHIB_CONTRACT,
  DEAD_ADDRESSES,
  KNOWN_ADDRESSES,
  INITIAL_SUPPLY_FLOAT,
  fmtCompact,
  fmtCommas,
  chartData,
  topBurners as calcTopBurners,
  type BurnTransaction,
} from '../lib/burns';
import { reverseResolveEnsBatch } from '../lib/ens';
import { reverseResolveShibName } from '../lib/sns';

/* ═══════════════════════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════════════════════ */

function useCountUp(target: number, duration = 2000): number {
  const [val, setVal] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (target === 0) return;
    const from = prev.current;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setVal(from + (target - from) * ease);
      if (t < 1) requestAnimationFrame(tick);
      else prev.current = target;
    }

    requestAnimationFrame(tick);
  }, [target, duration]);

  return val;
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG AREA CHART
   ═══════════════════════════════════════════════════════════════════════ */

const BurnChart: React.FC<{
  data: { time: number; amount: number }[];
}> = ({ data }) => {
  const W = 340;
  const H = 150;
  const PX = 4;
  const PY = 8;
  const cW = W - PX * 2;
  const cH = H - PY * 2;

  if (data.length < 2)
    return (
      <div className="flex items-center justify-center h-[150px] text-gray-600 text-xs">
        Not enough data for chart
      </div>
    );

  const maxVal = Math.max(...data.map((d) => d.amount)) || 1;

  const pts = data.map((d, i) => ({
    x: PX + (i / (data.length - 1)) * cW,
    y: PY + cH - (d.amount / maxVal) * cH * 0.92,
  }));

  // smooth bezier path
  const line = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const cp = (pts[i - 1].x + p.x) / 2;
    return `${acc} C ${cp} ${pts[i - 1].y} ${cp} ${p.y} ${p.x} ${p.y}`;
  }, '');

  const area = `${line} L ${pts[pts.length - 1].x} ${PY + cH} L ${pts[0].x} ${PY + cH} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      style={{ height: 150 }}
    >
      <defs>
        <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF6900" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FF6900" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#burnGrad)" />
      <path
        d={line}
        fill="none"
        stroke="url(#burnLineGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <linearGradient id="burnLineGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#FFB800" />
        <stop offset="100%" stopColor="#FF4500" />
      </linearGradient>
    </svg>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   FIRE PARTICLES (success animation)
   ═══════════════════════════════════════════════════════════════════════ */

const FireParticles: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  const particles = useMemo(
    () =>
      Array.from({ length: 35 }, (_, i) => ({
        id: i,
        left: `${10 + Math.random() * 80}%`,
        delay: `${Math.random() * 0.6}s`,
        dur: `${1.2 + Math.random() * 1.0}s`,
        size: `${4 + Math.random() * 8}px`,
        hue: 15 + Math.random() * 30,
        light: 50 + Math.random() * 20,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-[60]">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: p.left,
            bottom: '40%',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: `hsl(${p.hue}, 100%, ${p.light}%)`,
            animation: `fire-rise ${p.dur} ${p.delay} ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   BURN MODAL
   ═══════════════════════════════════════════════════════════════════════ */

const BurnModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSuccess: (hash: string, amount: string) => void;
}> = ({ open, onClose, onSuccess }) => {
  const { address, privateKey } = useWalletStore();
  const addTx = useTransactionStore((s) => s.addTransaction);

  const [amount, setAmount] = useState('');
  const [shibBalance, setShibBalance] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<number | null>(null);
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm'>('input');

  const ethNetwork = getNetworkByChainId(1);

  const client = useMemo(() => {
    if (!ethNetwork) return null;
    const rpcs = [ethNetwork.rpcUrl, ...(ethNetwork.rpcFallbacks ?? [])];
    return createPublicClient({
      chain: {
        id: 1,
        name: 'Ethereum',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: rpcs } },
      } as any,
      transport:
        rpcs.length > 1
          ? fallback(rpcs.map((u) => http(u, { timeout: 5_000 })))
          : http(rpcs[0], { timeout: 5_000 }),
    });
  }, [ethNetwork]);

  // Fetch balances when modal opens
  useEffect(() => {
    if (!open || !client || !address) return;
    (async () => {
      try {
        const [shibRaw, ethRaw] = await Promise.all([
          client.readContract({
            address: SHIB_CONTRACT,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          }),
          client.getBalance({ address: address as `0x${string}` }),
        ]);
        setShibBalance(parseFloat(formatUnits(shibRaw as bigint, 18)));
        setEthBalance(parseFloat(formatUnits(ethRaw, 18)));
      } catch {
        /* balances will show as null */
      }
    })();
  }, [open, client, address]);

  // Estimate gas when amount changes
  useEffect(() => {
    if (!client || !address || !amount || parseFloat(amount) <= 0) {
      setGasEstimate(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const parsed = parseUnits(amount, 18);
        const gas = await client.estimateContractGas({
          address: SHIB_CONTRACT,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [DEAD_ADDRESSES[2], parsed],
          account: address as `0x${string}`,
        });
        const gasPrice = await client.getGasPrice();
        const costWei = gas * gasPrice;
        setGasEstimate(parseFloat(formatUnits(costWei, 18)).toFixed(6));
      } catch {
        setGasEstimate(null);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [amount, client, address]);

  const handleBurn = async () => {
    if (!client || !address || !privateKey || !amount) return;
    setSending(true);

    try {
      const parsed = parseUnits(amount, 18);
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const rpcs = ethNetwork
        ? [ethNetwork.rpcUrl, ...(ethNetwork.rpcFallbacks ?? [])]
        : ['https://eth.llamarpc.com'];

      const walletClient = createWalletClient({
        chain: {
          id: 1,
          name: 'Ethereum',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: rpcs } },
        } as any,
        transport:
          rpcs.length > 1
            ? fallback(rpcs.map((u) => http(u, { timeout: 5_000 })))
            : http(rpcs[0], { timeout: 5_000 }),
        account,
      });

      toast.loading('Sending burn transaction...', { id: 'burn' });

      const chain = {
        id: 1,
        name: 'Ethereum',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: rpcs } },
      } as any;

      const hash = await walletClient.writeContract({
        address: SHIB_CONTRACT,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [DEAD_ADDRESSES[2], parsed],
        chain,
        account,
      });

      toast.loading('Waiting for confirmation...', { id: 'burn' });

      await client.waitForTransactionReceipt({
        hash,
        timeout: 90_000,
        pollingInterval: 3_000,
      });

      addTx({
        hash,
        from: address,
        to: DEAD_ADDRESSES[2],
        value: parsed.toString(),
        timeStamp: Math.floor(Date.now() / 1000).toString(),
        type: 'send',
        chainId: 1,
        tokenSymbol: 'SHIB',
        tokenDecimal: '18',
        tokenName: 'SHIBA INU',
      });

      toast.success('SHIB burned!', { id: 'burn' });
      onSuccess(hash, amount);
      onClose();
    } catch (err: any) {
      console.error('[Burn] tx failed:', err);
      toast.error(err?.shortMessage || 'Burn failed', { id: 'burn' });
    } finally {
      setSending(false);
    }
  };

  const reset = useCallback(() => {
    setAmount('');
    setStep('input');
    setSending(false);
    setGasEstimate(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  if (!open) return null;

  const parsedAmt = parseFloat(amount) || 0;
  const insufficientShib = shibBalance !== null && parsedAmt > shibBalance;
  const canProceed = parsedAmt > 0 && !insufficientShib;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md mx-4 mb-4 bg-[#141414] border border-white/[0.08] rounded-3xl p-6 shadow-2xl"
        style={{ animation: 'slide-up-fade 250ms ease-out' }}
      >
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center">
            <Flame size={16} className="text-orange-400" />
          </div>
          <h3 className="text-base font-bold text-white">Burn SHIB</h3>
        </div>

        {step === 'input' ? (
          <>
            {/* Amount input */}
            <div className="relative mb-3">
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white text-lg
                           placeholder-gray-600 focus:outline-none focus:border-orange-500/40 transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="text-xs text-gray-400 font-semibold">SHIB</span>
                {shibBalance !== null && (
                  <button
                    onClick={() => setAmount(Math.floor(shibBalance).toString())}
                    className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded"
                  >
                    MAX
                  </button>
                )}
              </div>
            </div>

            {shibBalance !== null && (
              <p className="text-[11px] text-gray-500 mb-4">
                Balance: <span className="text-gray-300">{fmtCommas(shibBalance)} SHIB</span>
              </p>
            )}

            {insufficientShib && (
              <div className="flex items-center gap-2 text-red-400 text-xs mb-4">
                <AlertTriangle size={13} /> Insufficient SHIB balance
              </div>
            )}

            <button
              disabled={!canProceed}
              onClick={() => setStep('confirm')}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all
                         bg-gradient-to-r from-orange-500 to-red-500 text-white
                         hover:from-orange-400 hover:to-red-400 active:scale-[0.98]
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              Continue
            </button>
          </>
        ) : (
          <>
            {/* Confirm step */}
            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Amount</span>
                <span className="text-white font-semibold">{fmtCommas(parsedAmt)} SHIB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">USD Value</span>
                <span className="text-gray-300">
                  ~${fmtCompact(parsedAmt * (useBurnStore.getState().shibPrice || 0))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Send to</span>
                <span className="text-gray-300 font-mono text-xs">0xdead...42069</span>
              </div>
              {gasEstimate && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Est. Gas</span>
                  <span className="text-gray-300">{gasEstimate} ETH</span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/[0.08] border border-red-500/20 mb-5">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-300 leading-relaxed">
                This action is <strong>irreversible</strong>. Burned SHIB tokens are permanently
                destroyed and cannot be recovered.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('input')}
                disabled={sending}
                className="flex-1 py-3 rounded-xl border border-white/[0.08] text-gray-300 text-sm font-medium
                           hover:bg-white/[0.04] transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleBurn}
                disabled={sending}
                className="flex-1 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                           bg-gradient-to-r from-orange-500 to-red-600 text-white
                           hover:from-orange-400 hover:to-red-500 active:scale-[0.98]
                           disabled:opacity-60 disabled:active:scale-100"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Burning...
                  </>
                ) : (
                  'Confirm Burn 🔥'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncAddr(a: string): string {
  if (!a) return '';
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

type ChartPeriod = '24H' | '7D' | '30D';
const CHART_CFG: Record<ChartPeriod, { bucket: number; window: number }> = {
  '24H': { bucket: 3600, window: 86_400 },
  '7D': { bucket: 86_400, window: 604_800 },
  '30D': { bucket: 86_400, window: 2_592_000 },
};

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

const Burns: React.FC = () => {
  const navigate = useNavigate();
  const { address, isUnlocked } = useWalletStore();
  const store = useBurnStore();

  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('7D');
  const [modalOpen, setModalOpen] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [burnResult, setBurnResult] = useState<{ hash: string; amount: string } | null>(null);

  // Ambient fire embers — generated once, drift upward across the page
  const ambientEmbers = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 6}s`,
        dur: `${8 + Math.random() * 6}s`,
        size: `${3 + Math.random() * 5}px`,
        hue: 15 + Math.random() * 25,
      })),
    [],
  );

  // Redirect guards
  useEffect(() => {
    if (!localStorage.getItem('shibwallet_vault')) {
      navigate('/', { replace: true });
      return;
    }
    if (!isUnlocked) navigate('/lock', { replace: true });
  }, [isUnlocked, navigate]);

  // Load cache + fetch on mount, auto-refresh every 60s, and refresh again
  // when the app returns from background (Android can suspend the WebView
  // which leaves in-flight fetches hanging and the burn data looking empty).
  useEffect(() => {
    store.loadCache();
    store.fetchBurnData();

    const iv = setInterval(() => {
      store.fetchBurnData();
    }, 60_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && useBurnStore.getState().needsRefresh()) {
        useBurnStore.getState().fetchBurnData();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated hero number
  const animBurned = useCountUp(store.totalBurned, 1200);
  const animPercent = useCountUp(store.burnPercent, 1000);

  // Chart data
  const cData = useMemo(() => {
    const cfg = CHART_CFG[chartPeriod];
    return chartData(store.recentBurns, cfg.bucket, cfg.window);
  }, [store.recentBurns, chartPeriod]);

  // Hall of Flame follows the selected chart window (24H / 7D / 30D).
  const periodTopBurners = useMemo(() => {
    const windowSec = CHART_CFG[chartPeriod].window;
    const cutoff = Math.floor(Date.now() / 1000) - windowSec;
    const windowed = store.recentBurns.filter((b) => b.timestamp >= cutoff);
    return calcTopBurners(windowed, store.shibPrice, 10);
  }, [store.recentBurns, store.shibPrice, chartPeriod]);

  // Reverse-resolve ENS / SNS names for the top burners so the Hall of Flame
  // shows "vitalik.eth" / "shibarmy.shib" instead of a truncated 0xabc…def.
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const attemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (periodTopBurners.length === 0) return;
    // Only resolve addresses we haven't already tried (regardless of whether
    // the previous attempt returned a name or not — null is a valid result
    // and we don't want to loop re-querying addresses with no ENS set).
    const addrs = periodTopBurners
      .filter((b) => !b.label && !attemptedRef.current.has(b.address.toLowerCase()))
      .map((b) => b.address);
    if (addrs.length === 0) return;

    // Mark as attempted immediately so concurrent renders don't re-queue.
    addrs.forEach((a) => attemptedRef.current.add(a.toLowerCase()));

    let cancelled = false;
    (async () => {
      try {
        const [ensHits, snsHits] = await Promise.all([
          reverseResolveEnsBatch(addrs).catch((err) => {
            console.error('[Burns] ENS batch failed:', err);
            return {} as Record<string, string | null>;
          }),
          Promise.all(
            addrs.map(async (a) => {
              try {
                const name = await reverseResolveShibName(a, 1);
                return [a.toLowerCase(), name] as const;
              } catch {
                return [a.toLowerCase(), null] as const;
              }
            }),
          ).then((rows) => Object.fromEntries(rows) as Record<string, string | null>),
        ]);

        if (cancelled) return;

        setNameMap((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const a of addrs) {
            const key = a.toLowerCase();
            const ens = ensHits[key];
            const sns = snsHits[key];
            // Prefer ENS for ETH addresses; fall back to SNS.
            if (ens) {
              next[key] = ens;
              changed = true;
            } else if (sns) {
              next[key] = sns.endsWith('.shib') ? sns : `${sns}.shib`;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch (err) {
        console.error('[Burns] name resolution failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // periodTopBurners is the only real dependency — attemptedRef is a ref
    // so changes to it don't trigger re-runs.
  }, [periodTopBurners]);

  const handleBurnSuccess = (hash: string, amount: string) => {
    setBurnResult({ hash, amount });
    setShowParticles(true);
    // refresh data
    setTimeout(() => store.fetchBurnData(), 5_000);
  };

  if (!isUnlocked || !address) return null;

  const isLoading = store.loading && store.totalBurned === 0;
  const burnRatePerHour = store.burns24h.amount / 24;
  const burnRatePerDay = store.burns24h.amount;
  const remainingSupply = Math.max(INITIAL_SUPPLY_FLOAT - store.totalBurned, 0);

  return (
    <>
      {showParticles && <FireParticles onDone={() => setShowParticles(false)} />}

      {/* ── AMBIENT FIRE — persistent background embers ─────────────── */}
      <div
        className="fixed left-0 right-0 bottom-0 h-[85vh] pointer-events-none z-0 overflow-hidden"
        aria-hidden="true"
      >
        {ambientEmbers.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: p.left,
              bottom: '-10px',
              width: p.size,
              height: p.size,
              background: `radial-gradient(circle, hsl(${p.hue}, 100%, 62%) 0%, transparent 70%)`,
              filter: 'blur(1.5px)',
              animation: `ember-rise ${p.dur} ${p.delay} linear infinite`,
            }}
          />
        ))}
        {/* Warm glow at the bottom edge */}
        <div
          className="absolute left-0 right-0 bottom-0 h-40"
          style={{
            background:
              'radial-gradient(ellipse at bottom, rgba(255,80,0,0.12) 0%, transparent 70%)',
          }}
        />
      </div>

      <main className="relative z-10 max-w-md mx-auto w-full px-5 pt-5 pb-40">
        {/* ── HERO — dramatic flame + huge number ─────────────────── */}
        <section className="relative text-center mb-6" style={{ animation: 'slide-up-fade 0.5s ease-out' }}>
          {/* Glow halo behind the flame */}
          <div
            className="absolute left-1/2 -top-4 w-72 h-72 pointer-events-none -z-0"
            style={{
              background:
                'radial-gradient(circle, rgba(255,105,0,0.28) 0%, rgba(196,27,14,0.12) 35%, transparent 65%)',
              animation: 'halo-breathe 4s ease-in-out infinite',
            }}
          />

          {/* Big flame medallion */}
          <div className="relative inline-flex items-center justify-center mb-4 z-10">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(255,70,0,0.75) 0%, transparent 65%)',
                filter: 'blur(16px)',
                transform: 'scale(2.2)',
              }}
            />
            <div
              className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center
                         border border-white/10"
              style={{
                background:
                  'radial-gradient(circle at 30% 20%, #FFD166 0%, #FF6900 40%, #C41B0E 100%)',
                boxShadow:
                  '0 0 40px rgba(255,80,0,0.65), 0 0 80px rgba(255,80,0,0.3), inset 0 2px 0 rgba(255,255,255,0.3)',
                animation: 'flame-flicker 2.4s ease-in-out infinite',
              }}
            >
              <Flame
                size={34}
                className="text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                strokeWidth={2.5}
                fill="currentColor"
              />
            </div>
          </div>

          {/* Live badge */}
          <div className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                          bg-red-500/10 border border-red-500/25 mb-3 z-10">
            <div className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </div>
            <span className="text-[10px] font-bold text-red-300 uppercase tracking-[0.2em]">
              Live Burn Tracker
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3 py-4 relative z-10">
              <div className="h-10 w-72 mx-auto rounded bg-white/[0.06] animate-shimmer" />
              <div className="h-4 w-40 mx-auto rounded bg-white/[0.04] animate-shimmer" />
            </div>
          ) : (
            <div className="relative z-10 px-2">
              <h1 className="text-[56px] sm:text-[68px] font-black tracking-tight leading-none mb-2 tabular-nums">
                <span
                  className="bg-gradient-to-br from-[#FFE48C] via-[#FF6900] to-[#C41B0E] bg-clip-text text-transparent"
                  style={{ filter: 'drop-shadow(0 0 24px rgba(255,105,0,0.55))' }}
                >
                  {fmtCompact(animBurned)}
                </span>
              </h1>
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.28em] mb-2">
                SHIB Incinerated Forever
              </p>
              <p className="text-[10px] text-gray-500 font-mono tabular-nums break-all leading-tight mb-2.5 max-w-[280px] mx-auto">
                {fmtCommas(animBurned)}
              </p>
              <p className="text-xs text-gray-400">
                {store.totalBurnedUSD > 0 ? (
                  <>
                    <span className="text-orange-400 font-bold text-sm">
                      ${fmtCompact(store.totalBurnedUSD)}
                    </span>
                    <span className="ml-1.5 text-gray-500">destroyed · never returns</span>
                  </>
                ) : (
                  <span className="text-gray-500">Destroyed forever · never returns</span>
                )}
              </p>
            </div>
          )}
        </section>

        {/* ── LIVE BURN RATE TICKER ───────────────────────────────── */}
        {!isLoading && burnRatePerDay > 0 && (
          <section
            className="mb-5 rounded-2xl border border-orange-500/20 overflow-hidden relative"
            style={{
              animation: 'slide-up-fade 0.5s ease-out 50ms both',
              background:
                'linear-gradient(135deg, rgba(255,105,0,0.09) 0%, rgba(196,27,14,0.05) 100%)',
            }}
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="relative w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/20
                              flex items-center justify-center shrink-0">
                <Zap size={16} className="text-orange-400" fill="currentColor" />
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-bold">
                  Burn Rate
                </p>
                <p className="text-sm font-bold text-white tabular-nums leading-tight">
                  {fmtCompact(burnRatePerHour)}
                  <span className="text-gray-400 font-medium text-[11px] ml-1">SHIB / hr</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] uppercase tracking-[0.18em] text-gray-500 font-bold">
                  24h Burned
                </p>
                <p className="text-sm font-bold text-orange-400 tabular-nums leading-tight">
                  {fmtCompact(store.burns24h.amount)}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── CIRCULAR BURN GAUGE ─────────────────────────────────── */}
        <section
          className="relative mb-6 rounded-2xl border border-white/[0.06] overflow-hidden"
          style={{
            animation: 'slide-up-fade 0.5s ease-out 100ms both',
            background:
              'radial-gradient(ellipse at 20% 30%, rgba(255,105,0,0.08) 0%, rgba(0,0,0,0.2) 70%)',
          }}
        >
          <div className="p-5 flex items-center gap-5">
            {/* SVG ring gauge */}
            <div className="relative shrink-0" style={{ width: 118, height: 118 }}>
              <svg width="118" height="118" viewBox="0 0 118 118" className="-rotate-90">
                <defs>
                  <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFE48C" />
                    <stop offset="45%" stopColor="#FF6900" />
                    <stop offset="100%" stopColor="#C41B0E" />
                  </linearGradient>
                </defs>
                {/* Track */}
                <circle cx="59" cy="59" r="50" stroke="rgba(255,255,255,0.06)" strokeWidth="9" fill="none" />
                {/* Progress */}
                <circle
                  cx="59"
                  cy="59"
                  r="50"
                  stroke="url(#gaugeGrad)"
                  strokeWidth="9"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(Math.min(animPercent, 100) / 100) * 314.16} 314.16`}
                  style={{
                    filter: 'drop-shadow(0 0 10px rgba(255,105,0,0.7))',
                    transition: 'stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[22px] font-black bg-gradient-to-br from-amber-300 to-red-500
                              bg-clip-text text-transparent tabular-nums leading-none">
                  {animPercent.toFixed(2)}%
                </p>
                <p className="text-[8px] text-gray-500 font-bold uppercase tracking-[0.15em] mt-1">
                  Burned
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1 min-w-0 space-y-2.5">
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.14em]">
                  Initial Supply
                </p>
                <p className="text-[13px] text-gray-300 font-semibold tabular-nums">1,000T SHIB</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.14em]">
                  Remaining
                </p>
                <p className="text-[13px] text-white font-bold tabular-nums">
                  {fmtCompact(remainingSupply)} <span className="text-gray-500 font-medium">SHIB</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingDown size={11} className="text-orange-400" />
                <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">
                  Deflationary Forever
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── TIME WINDOW CARDS ─────────────────────────────────── */}
        <section className="mb-6" style={{ animation: 'slide-up-fade 0.5s ease-out 160ms both' }}>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { label: '24H', data: store.burns24h },
                { label: '7D', data: store.burns7d },
                { label: '30D', data: store.burns30d },
              ] as const
            ).map((card, idx) => (
              <div
                key={card.label}
                className="relative p-3 rounded-xl border border-white/[0.06] overflow-hidden
                           hover:border-orange-500/30 transition-all group"
                style={{
                  background:
                    'linear-gradient(160deg, rgba(255,105,0,0.05) 0%, rgba(0,0,0,0.2) 100%)',
                  animation: `slide-up-fade 0.4s ease-out ${180 + idx * 60}ms both`,
                }}
              >
                {/* Corner flame accent */}
                <div className="absolute top-1.5 right-1.5 opacity-20 group-hover:opacity-60 transition-opacity">
                  <Flame size={11} className="text-orange-400" fill="currentColor" />
                </div>
                <p className="text-[9px] font-black text-orange-400/80 uppercase tracking-[0.12em] mb-1.5">
                  {card.label}
                </p>
                <p className="text-[13px] font-bold text-white leading-tight tabular-nums">
                  {fmtCompact(card.data.amount)}
                </p>
                {card.data.usd > 0 && (
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    ${fmtCompact(card.data.usd)}
                  </p>
                )}
                <p className="text-[9px] text-gray-600 mt-0.5">
                  {card.data.count} tx{card.data.count !== 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CHART ────────────────────────────────────────────────────── */}
        <section
          className="mb-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden"
          style={{ animation: 'slide-up-fade 0.4s ease-out 120ms both' }}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h3 className="text-xs font-semibold text-gray-400">Burn Activity</h3>
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04]">
              {(['24H', '7D', '30D'] as ChartPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all
                    ${
                      chartPeriod === p
                        ? 'bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-white shadow'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <BurnChart data={cData} />
        </section>

        {/* ── LATEST BURNS ─────────────────────────────────────────────── */}
        <section
          className="mb-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden"
          style={{ animation: 'slide-up-fade 0.4s ease-out 180ms both' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-xs font-semibold text-gray-400">Latest Burns</h3>
            <button
              onClick={() => store.fetchBurnData()}
              disabled={store.loading}
              className="text-gray-500 hover:text-white p-1 rounded transition-colors"
            >
              <RefreshCw size={13} className={store.loading ? 'animate-spin-slow' : ''} />
            </button>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] animate-shimmer" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 rounded bg-white/[0.06] animate-shimmer" />
                    <div className="h-2.5 w-16 rounded bg-white/[0.04] animate-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : store.recentBurns.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Flame size={24} className="mx-auto text-gray-600 mb-2" />
              <p className="text-xs text-gray-500">No recent burns found</p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              {store.recentBurns.slice(0, 25).map((tx, idx) => {
                const shibAmt = parseFloat(formatUnits(BigInt(tx.amount), 18));
                const isRecent = Date.now() / 1000 - tx.timestamp < 300;
                const label =
                  KNOWN_ADDRESSES[tx.from.toLowerCase()] || truncAddr(tx.from);

                return (
                  <div
                    key={tx.hash}
                    className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-b-0
                               hover:bg-white/[0.02] cursor-pointer transition-colors group"
                    style={{ animation: `slide-up-fade 0.35s ease-out ${idx * 25}ms both` }}
                    onClick={() =>
                      navigate(
                        `/wallet/browser?url=${encodeURIComponent(`https://etherscan.io/tx/${tx.hash}`)}`,
                      )
                    }
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                        bg-orange-500/10 ${isRecent ? 'animate-pulse-glow' : ''}`}
                    >
                      <Flame size={14} className="text-orange-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium truncate">{label}</p>
                      <p className="text-[10px] text-gray-600">{timeAgo(tx.timestamp)}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-orange-400">
                        {fmtCompact(shibAmt)} SHIB
                      </p>
                      <p className="text-[10px] text-gray-600">
                        ${fmtCompact(shibAmt * store.shibPrice)}
                      </p>
                    </div>

                    <ExternalLink
                      size={10}
                      className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── TOP BURNERS LEADERBOARD ─────────────────────────────── */}
        {periodTopBurners.length > 0 && (
          <section
            className="mb-6 rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{
              animation: 'slide-up-fade 0.5s ease-out 240ms both',
              background:
                'linear-gradient(180deg, rgba(255,184,0,0.04) 0%, rgba(0,0,0,0.2) 100%)',
            }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <Trophy size={14} className="text-amber-400 drop-shadow-[0_0_6px_rgba(255,184,0,0.6)]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Hall of Flame</h3>
              <span className="ml-auto text-[9px] text-amber-400/80 uppercase tracking-wider font-bold">
                Top Burners · {chartPeriod}
              </span>
            </div>

            <div>
              {periodTopBurners.map((burner, idx) => {
                const isPodium = idx < 3;
                const rankGradient =
                  idx === 0
                    ? 'from-amber-300 via-yellow-400 to-amber-600'
                    : idx === 1
                      ? 'from-gray-200 via-gray-300 to-gray-500'
                      : idx === 2
                        ? 'from-orange-400 via-orange-600 to-orange-800'
                        : '';
                const rankGlow =
                  idx === 0
                    ? 'shadow-[0_0_14px_rgba(255,184,0,0.5)]'
                    : idx === 1
                      ? 'shadow-[0_0_10px_rgba(200,200,200,0.35)]'
                      : idx === 2
                        ? 'shadow-[0_0_10px_rgba(255,100,0,0.35)]'
                        : '';

                return (
                  <div
                    key={burner.address}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-b-0
                                ${idx === 0 ? 'bg-gradient-to-r from-amber-500/[0.06] to-transparent' : ''}`}
                    style={{ animation: `slide-up-fade 0.35s ease-out ${idx * 35}ms both` }}
                  >
                    {/* Rank badge */}
                    {isPodium ? (
                      <div
                        className={`relative w-7 h-7 rounded-full flex items-center justify-center shrink-0
                                    bg-gradient-to-br ${rankGradient} ${rankGlow}`}
                      >
                        {idx === 0 ? (
                          <Crown size={13} className="text-white drop-shadow" strokeWidth={2.5} />
                        ) : (
                          <Medal size={13} className="text-white drop-shadow" strokeWidth={2.5} />
                        )}
                      </div>
                    ) : (
                      <span className="w-7 text-center text-xs font-black text-gray-600 tabular-nums">
                        {idx + 1}
                      </span>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-semibold truncate">
                        {burner.label ||
                          nameMap[burner.address.toLowerCase()] ||
                          truncAddr(burner.address)}
                      </p>
                      <p className="text-[10px] text-gray-600">
                        {burner.burnCount} burn{burner.burnCount !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-orange-400 tabular-nums">
                        {fmtCompact(burner.totalBurned)}
                      </p>
                      {burner.usdValue > 0 && (
                        <p className="text-[10px] text-gray-600 tabular-nums">
                          ${fmtCompact(burner.usdValue)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── BURN CTA — dramatic hero button ────────────────────── */}
        <section
          className="relative mt-8"
          style={{ animation: 'slide-up-fade 0.5s ease-out 300ms both' }}
        >
          {/* Blurred glow halo behind button */}
          <div
            className="absolute -inset-2 rounded-3xl -z-10 opacity-70"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(255,80,0,0.5) 0%, rgba(196,27,14,0.2) 40%, transparent 70%)',
              filter: 'blur(22px)',
              animation: 'halo-breathe 3s ease-in-out infinite',
            }}
          />

          <button
            onClick={() => setModalOpen(true)}
            className="relative w-full py-5 rounded-2xl overflow-hidden group active:scale-[0.98]
                       transition-transform duration-150"
            style={{
              background: 'linear-gradient(135deg, #FFB800 0%, #FF6900 35%, #C41B0E 100%)',
              backgroundSize: '180% 180%',
              animation:
                'gradient-shift 5s ease-in-out infinite, burn-cta-glow 2.5s ease-in-out infinite',
            }}
          >
            {/* Inner highlight */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 45%, rgba(0,0,0,0.25) 100%)',
              }}
            />
            {/* Shine sweep on hover */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{
                background:
                  'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s linear infinite',
              }}
            />
            <div className="relative flex items-center justify-center gap-3">
              <Flame
                size={22}
                className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                fill="currentColor"
                strokeWidth={2.5}
              />
              <span className="text-base font-black text-white uppercase tracking-[0.2em]
                               drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                Burn SHIB
              </span>
              <Flame
                size={22}
                className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                fill="currentColor"
                strokeWidth={2.5}
              />
            </div>
          </button>
          <p className="text-center text-[10px] text-gray-500 mt-2.5 tracking-wide">
            Permanently destroy SHIB · Reduce supply forever
          </p>
        </section>

        {/* ── Success result ───────────────────────────────────────────── */}
        {burnResult && (
          <div
            className="mt-5 p-4 rounded-2xl bg-green-500/[0.08] border border-green-500/20 text-center"
            style={{ animation: 'slide-up-fade 0.4s ease-out' }}
          >
            <p className="text-sm font-bold text-green-400 mb-1">
              You burned {fmtCommas(parseFloat(burnResult.amount))} SHIB! 🔥
            </p>
            <button
              onClick={() =>
                navigate(
                  `/wallet/browser?url=${encodeURIComponent(`https://etherscan.io/tx/${burnResult.hash}`)}`,
                )
              }
              className="text-[11px] text-green-300 underline"
            >
              View Transaction
            </button>
          </div>
        )}
      </main>

      <BurnModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleBurnSuccess}
      />
    </>
  );
};

export default Burns;
