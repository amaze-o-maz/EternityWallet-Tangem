import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Search, TrendingUp, Gamepad2, Image, Rocket, Coins, LayoutGrid, Fingerprint, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWalletStore } from '../store/walletStore';
interface DApp {
  name: string;
  description: string;
  url: string;
  category: string;
  logoUrl?: string;
  featured?: boolean;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'defi', label: 'DeFi', icon: Coins },
  { id: 'dex', label: 'DEX', icon: TrendingUp },
  { id: 'launchpad', label: 'Launchpad', icon: Rocket },
  { id: 'nft', label: 'NFT', icon: Image },
  { id: 'gaming', label: 'Gaming', icon: Gamepad2 },
  { id: 'identity', label: 'Identity', icon: Fingerprint },
];

// Google Favicon API gives reliable, high-res favicons for any domain
const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

const DAPPS: DApp[] = [
  {
    name: 'ShibaSwap',
    description: 'The official Shiba Inu DEX. Swap, provide liquidity, and earn yield on Shibarium.',
    url: 'https://shibaswap.com',
    category: 'dex',
    logoUrl: favicon('shibaswap.com'),
    featured: true,
  },
  {
    name: 'K9 Finance',
    description: 'Liquid staking protocol for BONE on Shibarium. Stake and earn with knBONE.',
    url: 'https://www.k9finance.com',
    category: 'defi',
    logoUrl: 'https://cdn.prod.website-files.com/67074574714d522db70d2bec/67075296e2daef2758ccac30_k9%20logo.png',
    featured: true,
  },
  {
    name: 'WoofSwap',
    description: 'Community-driven DEX on Shibarium with competitive rates and low fees.',
    url: 'https://woofswap.finance',
    category: 'dex',
    logoUrl: favicon('woofswap.finance'),
  },
  {
    name: 'ChewySwap',
    description: 'Fast and efficient decentralized exchange built natively on Shibarium.',
    url: 'https://chewyswap.dog',
    category: 'dex',
    logoUrl: favicon('chewyswap.dog'),
  },
  {
    name: 'Marswap',
    description: 'Multi-chain DEX and DeFi hub with staking, farming, and token launches.',
    url: 'https://marswap.exchange',
    category: 'dex',
    logoUrl: favicon('marswap.exchange'),
  },
  {
    name: 'DogPad',
    description: 'Premier Shibarium launchpad. Discover and invest in new ecosystem projects.',
    url: 'https://dogpad.io',
    category: 'launchpad',
    logoUrl: favicon('dogpad.io'),
    featured: true,
  },
  {
    name: 'ShibPad',
    description: 'Token launchpad for the Shiba Inu ecosystem with fair launch mechanics.',
    url: 'https://shibpad.com',
    category: 'launchpad',
    logoUrl: favicon('shibpad.com'),
  },
  {
    name: 'Serp Finance',
    description: 'Perpetual DEX on Shibarium. Trade with leverage on your favorite pairs.',
    url: 'https://serp.finance',
    category: 'defi',
    logoUrl: favicon('serp.finance'),
  },
  {
    name: 'DogSwap',
    description: 'Yield farming and AMM DEX with community governance on Shibarium.',
    url: 'https://dogswap.xyz',
    category: 'dex',
    logoUrl: favicon('dogswap.xyz'),
  },
  {
    name: 'PunkSwap',
    description: 'Decentralized swap platform with NFT integrations on Shibarium.',
    url: 'https://punkswap.exchange',
    category: 'dex',
    logoUrl: favicon('punkswap.exchange'),
  },
  {
    name: 'Shibex',
    description: 'All-in-one DeFi platform for swapping, staking, and bridging on Shibarium.',
    url: 'https://shibex.io',
    category: 'defi',
    logoUrl: favicon('shibex.io'),
  },
  {
    name: 'Shib Chomp',
    description: 'Secure token storage and management dApp with innovative vault features.',
    url: 'https://shibchomp.com',
    category: 'defi',
    logoUrl: favicon('shibchomp.com'),
  },
  {
    name: 'SHIB Metaverse',
    description: 'Immersive virtual world with NFT land, resource farming, and exploration.',
    url: 'https://shib.io/metaverse',
    category: 'gaming',
    logoUrl: favicon('shib.io'),
    featured: true,
  },
  {
    name: 'Shibarium NFTs',
    description: 'NFT marketplace for minting, buying, and selling digital art on Shibarium.',
    url: 'https://shibariumscan.io/apps',
    category: 'nft',
    logoUrl: favicon('shibariumscan.io'),
  },
  {
    name: 'Shib Infra',
    description: 'Developer tools, APIs, and infrastructure for building on Shibarium.',
    url: 'https://shib.io/dapps',
    category: 'defi',
    logoUrl: favicon('shib.io'),
  },
  {
    name: 'Shib Name Service',
    description: 'Register your .shib identity. Send and receive with human-readable names.',
    url: 'https://shib.io/sns',
    category: 'identity',
    logoUrl: favicon('shib.io'),
    featured: true,
  },
];

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 35%)`;
}

const DAppCard: React.FC<{ dapp: DApp; index: number; onOpen: (url: string) => void }> = ({ dapp, index, onOpen }) => {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <button
      onClick={() => onOpen(dapp.url)}
      className="group glass-card-sm p-4 flex items-start gap-3.5 transition-all duration-300 w-full text-left
                 hover:border-[#FF6900]/30 hover:bg-white/[0.06] hover:shadow-[0_4px_30px_rgba(255,105,0,0.1)]
                 hover:-translate-y-0.5 active:scale-[0.98]"
      style={{ animation: `slide-up-fade 0.4s ease-out ${index * 60}ms both` }}
    >
      {/* Logo */}
      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0">
        <div
          className="w-12 h-12 flex items-center justify-center text-sm font-bold text-white"
          style={{ backgroundColor: stringToColor(dapp.name) }}
        >
          {dapp.name.slice(0, 2)}
        </div>
        {dapp.logoUrl && imgLoaded && (
          <img
            src={dapp.logoUrl}
            alt={dapp.name}
            className="w-12 h-12 absolute inset-0 object-cover"
          />
        )}
        {dapp.logoUrl && (
          <img
            src={dapp.logoUrl}
            alt=""
            className="hidden"
            onLoad={() => setImgLoaded(true)}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-white text-sm font-semibold truncate group-hover:text-[#FF6900] transition-colors">
            {dapp.name}
          </h3>
          {dapp.featured && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-gradient-to-r from-[#FF6900] to-[#FFB800] text-white shrink-0">
              HOT
            </span>
          )}
        </div>
        <p className="text-gray-500 text-xs mt-1 line-clamp-2 leading-relaxed">
          {dapp.description}
        </p>
        <span className="inline-block mt-2 text-[10px] font-medium text-gray-600 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
          {CATEGORIES.find((c) => c.id === dapp.category)?.label ?? dapp.category}
        </span>
      </div>

      {/* Arrow */}
      <ExternalLink
        size={14}
        className="text-gray-600 group-hover:text-[#FF6900] transition-colors shrink-0 mt-1"
      />
    </button>
  );
};

const DApps: React.FC = () => {
  const nav = useNavigate();
  const activeAccount = useWalletStore((s) => s.activeAccount());
  const isTangem = activeAccount?.kind === 'tangem';
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const openDApp = (url: string) => {
    if (isTangem) {
      // TODO(v2): the native dApp browser injects a raw privateKey; to support
      // Tangem we'd need to forward signing requests back through JS for NFC.
      toast.error('dApp browser needs a hot wallet for now. Tangem support coming soon.');
      return;
    }
    nav(`/wallet/browser?url=${encodeURIComponent(url)}`);
  };

  const filtered = DAPPS.filter((d) => {
    const matchCat = activeCategory === 'all' || d.category === activeCategory;
    const matchSearch =
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
      <main className="max-w-md mx-auto w-full px-5 pt-6 pb-40">
        {/* Title */}
        <div className="mb-5">
          <h1 className="text-xl font-bold gradient-text">Shibarium dApps</h1>
          <p className="text-gray-500 text-xs mt-1">Explore the Shiba Inu ecosystem</p>
        </div>

        {isTangem && (
          <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl bg-[#FFB800]/[0.06] border border-[#FFB800]/15">
            <CreditCard size={16} className="text-[#FFB800] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-[#FFB800] mb-0.5">dApp browser coming soon for Tangem</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                External dApps need a hot wallet for now. Send, receive, and swap work normally with your card.
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search dApps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]
                       text-white text-sm placeholder-gray-600 backdrop-blur-xl
                       focus:border-[#FF6900] transition-all"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0
                            transition-all duration-200 border
                            ${active
                              ? 'bg-gradient-to-r from-[#FF6900] to-[#FF8C00] text-white border-transparent shadow-[0_0_15px_rgba(255,105,0,0.25)]'
                              : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                            }`}
              >
                <Icon size={12} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Featured section */}
        {activeCategory === 'all' && !search && (
          <div className="mb-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Featured</h2>
            <div className="grid grid-cols-2 gap-3">
              {DAPPS.filter((d) => d.featured).map((dapp, i) => (
                <button
                  key={dapp.name}
                  onClick={() => openDApp(dapp.url)}
                  className="glass-card-sm p-3.5 group hover:border-[#FF6900]/30 transition-all duration-300 text-left
                             hover:shadow-[0_4px_30px_rgba(255,105,0,0.12)] hover:-translate-y-0.5 active:scale-[0.97]"
                  style={{ animation: `slide-up-fade 0.35s ease-out ${i * 80}ms both` }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white mb-2.5"
                    style={{ backgroundColor: stringToColor(dapp.name) }}
                  >
                    {dapp.logoUrl ? (
                      <img src={dapp.logoUrl} alt={dapp.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      dapp.name.slice(0, 2)
                    )}
                  </div>
                  <h3 className="text-white text-sm font-semibold truncate group-hover:text-[#FF6900] transition-colors">
                    {dapp.name}
                  </h3>
                  <p className="text-gray-500 text-[11px] mt-0.5 line-clamp-2 leading-relaxed">
                    {dapp.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All dApps list */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
            {activeCategory === 'all' && !search ? 'All dApps' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
          </h2>
          <div className="space-y-2.5">
            {filtered.map((dapp, i) => (
              <DAppCard key={dapp.name} dapp={dapp} index={i} onOpen={openDApp} />
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-sm">No dApps found</p>
                <p className="text-gray-600 text-xs mt-1">Try a different search or category</p>
              </div>
            )}
          </div>
        </div>
      </main>
  );
};

export default DApps;
