export interface TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isNative?: boolean;
  logoUrl: string;
}

// CoinGecko CDN for major tokens (using thumb size with verified image IDs)
const cg = 'https://assets.coingecko.com/coins/images';

const LOGOS: Record<string, string> = {
  ETH: `${cg}/279/thumb/ethereum.png?1696501628`,
  SHIB: `${cg}/11939/thumb/shiba.png`,
  BONE: `${cg}/16916/thumb/bone_icon.png?1696516487`,
  LEASH: `${cg}/15802/thumb/Leash.png?1696515425`,
  TREAT: `${cg}/53501/thumb/Treat_blk_200x200.png?1736524245`,
  WETH: `${cg}/2518/thumb/weth.png?1696503332`,
  USDT: `${cg}/325/thumb/Tether.png?1696501661`,
  USDC: `${cg}/6319/thumb/usdc.png?1696506694`,
  DAI: `${cg}/9956/thumb/Badge_Dai.png?1696509996`,
  WBTC: `${cg}/7598/thumb/wrapped_bitcoin_wbtc.png?1696507857`,
  tBONE: `${cg}/16916/thumb/bone_icon.png?1696516487`,
  xSHIB: `${cg}/11939/thumb/shiba.png`,
  xLEASH: `${cg}/15802/thumb/Leash.png?1696515425`,
  WBONE: `${cg}/16916/thumb/bone_icon.png?1696516487`,
};

export const ETHEREUM_TOKENS: TokenInfo[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    isNative: true,
    logoUrl: LOGOS.ETH,
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    decimals: 18,
    logoUrl: LOGOS.SHIB,
  },
  {
    symbol: 'BONE',
    name: 'Bone ShibaSwap',
    address: '0x9813037ee2218799597d83D4a5B6F3b6778218d9',
    decimals: 18,
    logoUrl: LOGOS.BONE,
  },
  {
    symbol: 'LEASH',
    name: 'Doge Killer',
    address: '0x27C70Cd1946795B66be9d954418546998b546634',
    decimals: 18,
    logoUrl: LOGOS.LEASH,
  },
  {
    symbol: 'TREAT',
    name: 'Shiba Inu Treat',
    address: '0xa02C49Da76A085e4E1EE60A6b920dDbC8db599F4',
    decimals: 18,
    logoUrl: LOGOS.TREAT,
  },
  {
    symbol: 'tBONE',
    name: 'xBONE Staked',
    address: '0xf7A0383750feF5AbaCe57cc4C9ff98e3790202b3',
    decimals: 18,
    logoUrl: LOGOS.tBONE,
  },
  {
    symbol: 'xSHIB',
    name: 'Staked SHIB',
    address: '0xB4a81261b16b92af0B9F7C4a83f1E885132D81e4',
    decimals: 18,
    logoUrl: LOGOS.xSHIB,
  },
  {
    symbol: 'xLEASH',
    name: 'Staked LEASH',
    address: '0xa57D319B3Cf3aD0E4d19770f71E63CF847263A0b',
    decimals: 18,
    logoUrl: LOGOS.xLEASH,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    decimals: 18,
    logoUrl: LOGOS.WETH,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    logoUrl: LOGOS.USDT,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    logoUrl: LOGOS.USDC,
  },
];

export const SHIBARIUM_TOKENS: TokenInfo[] = [
  {
    symbol: 'BONE',
    name: 'Bone',
    address: '0x0000000000000000000000000000000000001010',
    decimals: 18,
    isNative: true,
    logoUrl: LOGOS.BONE,
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    address: '0x495eea66b0f8b636d441dc6a98d8f5c3d455c4c0',
    decimals: 18,
    logoUrl: LOGOS.SHIB,
  },
  {
    symbol: 'LEASH',
    name: 'Doge Killer',
    address: '0x65218a41fb92637254b4f8c97448d3df343a3064',
    decimals: 18,
    logoUrl: LOGOS.LEASH,
  },
  {
    symbol: 'TREAT',
    name: 'Shiba Inu Treat',
    address: '0x506d8d2d9c715Eb34F514cc3EF48C7aBD19e2bc7',
    decimals: 18,
    logoUrl: LOGOS.TREAT,
  },
  {
    symbol: 'WBONE',
    name: 'Wrapped BONE',
    address: '0xC76F4c819D820369Fb2d7C1531aB3Bb18e6fE8d8',
    decimals: 18,
    logoUrl: LOGOS.WBONE,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x8ed7d143ef452316ab1123d28ab302dc3b80d3ce',
    decimals: 18,
    logoUrl: LOGOS.WETH,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xaB082b8ad96c7f47ED70ED971Ce2116469954cFB',
    decimals: 6,
    logoUrl: LOGOS.USDT,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xf010f12dcA0b96D2d6685bf4dB3dbB4Ad500B6Ad',
    decimals: 6,
    logoUrl: LOGOS.USDC,
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0x0726959d22361B79e4D50A5D157b044A83eC870d',
    decimals: 18,
    logoUrl: LOGOS.DAI,
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    address: '0xE984D89fb00D0B44E798A55dc41EA598B0b0899d',
    decimals: 8,
    logoUrl: LOGOS.WBTC,
  },
];

const CUSTOM_TOKENS_KEY = 'shibwallet_custom_tokens';

function loadCustomTokens(): Record<string, TokenInfo[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_TOKENS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCustomTokens(tokens: Record<string, TokenInfo[]>) {
  localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(tokens));
}

export function getTokensForChain(chainId: number): TokenInfo[] {
  const defaults = chainId === 109 ? SHIBARIUM_TOKENS : chainId === 1 ? ETHEREUM_TOKENS : [];
  const custom = loadCustomTokens()[String(chainId)] ?? [];
  return [...defaults, ...custom];
}

export function addCustomToken(chainId: number, token: TokenInfo): void {
  const all = loadCustomTokens();
  const key = String(chainId);
  const existing = all[key] ?? [];
  // Don't add duplicates
  if (existing.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) return;
  all[key] = [...existing, token];
  saveCustomTokens(all);
}

export function removeCustomToken(chainId: number, address: string): void {
  const all = loadCustomTokens();
  const key = String(chainId);
  const existing = all[key] ?? [];
  all[key] = existing.filter((t) => t.address.toLowerCase() !== address.toLowerCase());
  saveCustomTokens(all);
}

export function isCustomToken(chainId: number, address: string): boolean {
  const custom = loadCustomTokens()[String(chainId)] ?? [];
  return custom.some((t) => t.address.toLowerCase() === address.toLowerCase());
}

export function isNativeToken(token: TokenInfo): boolean {
  return !!token.isNative;
}
