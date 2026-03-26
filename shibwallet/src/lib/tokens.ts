export interface TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isNative?: boolean;
  logoUrl: string;
}

const ethLogoBase = 'https://cdn.shib.io/tokens/images/1';
const shibLogoBase = 'https://cdn.shib.io/tokens/images/109';

export const ETHEREUM_TOKENS: TokenInfo[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    isNative: true,
    logoUrl: `${ethLogoBase}/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2.png`,
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE.png`,
  },
  {
    symbol: 'BONE',
    name: 'Bone ShibaSwap',
    address: '0x9813037ee2218799597d83D4a5B6F3b6778218d9',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0x9813037ee2218799597d83D4a5B6F3b6778218d9.png`,
  },
  {
    symbol: 'LEASH',
    name: 'Doge Killer',
    address: '0x27C70Cd1946795B66be9d954418546998b546634',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0x27C70Cd1946795B66be9d954418546998b546634.png`,
  },
  {
    symbol: 'TREAT',
    name: 'Shiba Inu Treat',
    address: '0xa02C49Da76A085e4E1EE60A6b920dDbC8db599F4',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0xa02C49Da76A085e4E1EE60A6b920dDbC8db599F4.png`,
  },
  {
    symbol: 'tBONE',
    name: 'xBONE Staked',
    address: '0xf7A0383750feF5AbaCe57cc4C9ff98e3790202b3',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0xf7A0383750feF5AbaCe57cc4C9ff98e3790202b3.png`,
  },
  {
    symbol: 'xSHIB',
    name: 'Staked SHIB',
    address: '0xB4a81261b16b92af0B9F7C4a83f1E885132D81e4',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0xB4a81261b16b92af0B9F7C4a83f1E885132D81e4.png`,
  },
  {
    symbol: 'xLEASH',
    name: 'Staked LEASH',
    address: '0xa57D319B3Cf3aD0E4d19770f71E63CF847263A0b',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0xa57D319B3Cf3aD0E4d19770f71E63CF847263A0b.png`,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    decimals: 18,
    logoUrl: `${ethLogoBase}/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2.png`,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    logoUrl: `${ethLogoBase}/0xdAC17F958D2ee523a2206206994597C13D831ec7.png`,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    logoUrl: `${ethLogoBase}/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.png`,
  },
];

export const SHIBARIUM_TOKENS: TokenInfo[] = [
  {
    symbol: 'BONE',
    name: 'Bone',
    address: '0x0000000000000000000000000000000000001010',
    decimals: 18,
    isNative: true,
    logoUrl: `${shibLogoBase}/0x0000000000000000000000000000000000001010.png`,
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    address: '0x495eea66b0f8b636d441dc6a98d8f5c3d455c4c0',
    decimals: 18,
    logoUrl: `${shibLogoBase}/0x495eea66b0f8b636d441dc6a98d8f5c3d455c4c0.png`,
  },
  {
    symbol: 'LEASH',
    name: 'Doge Killer',
    address: '0x65218a41fb92637254b4f8c97448d3df343a3064',
    decimals: 18,
    logoUrl: `${shibLogoBase}/0x65218a41fb92637254b4f8c97448d3df343a3064.png`,
  },
  {
    symbol: 'TREAT',
    name: 'Shiba Inu Treat',
    address: '0x506d8d2d9c715Eb34F514cc3EF48C7aBD19e2bc7',
    decimals: 18,
    logoUrl: `${shibLogoBase}/0x506d8d2d9c715Eb34F514cc3EF48C7aBD19e2bc7.png`,
  },
  {
    symbol: 'WBONE',
    name: 'Wrapped BONE',
    address: '0xC76F4c819D820369Fb2d7C1531aB3Bb18e6fE8d8',
    decimals: 18,
    logoUrl: `${shibLogoBase}/0xC76F4c819D820369Fb2d7C1531aB3Bb18e6fE8d8.png`,
  },
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x8ed7d143ef452316ab1123d28ab302dc3b80d3ce',
    decimals: 18,
    logoUrl: `${shibLogoBase}/0x8ed7d143ef452316ab1123d28ab302dc3b80d3ce.png`,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0xaB082b8ad96c7f47ED70ED971Ce2116469954cFB',
    decimals: 6,
    logoUrl: `${shibLogoBase}/0xaB082b8ad96c7f47ED70ED971Ce2116469954cFB.png`,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xf010f12dcA0b96D2d6685bf4dB3dbB4Ad500B6Ad',
    decimals: 6,
    logoUrl: `${shibLogoBase}/0xf010f12dcA0b96D2d6685bf4dB3dbB4Ad500B6Ad.png`,
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    address: '0x0726959d22361B79e4D50A5D157b044A83eC870d',
    decimals: 18,
    logoUrl: `${shibLogoBase}/0x0726959d22361B79e4D50A5D157b044A83eC870d.png`,
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    address: '0xE984D89fb00D0B44E798A55dc41EA598B0b0899d',
    decimals: 8,
    logoUrl: `${shibLogoBase}/0xE984D89fb00D0B44E798A55dc41EA598B0b0899d.png`,
  },
  {
    symbol: 'XFUND',
    name: 'xFUND',
    address: '0x89dc93C6c12CaE47aCAf4aD9305d7A442C30dBB2',
    decimals: 9,
    logoUrl: `${shibLogoBase}/0x89dc93C6c12CaE47aCAf4aD9305d7A442C30dBB2.png`,
  },
];

export function getTokensForChain(chainId: number): TokenInfo[] {
  return chainId === 109 ? SHIBARIUM_TOKENS : ETHEREUM_TOKENS;
}

export function isNativeToken(token: TokenInfo): boolean {
  return !!token.isNative;
}
