export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeToken: { symbol: string; decimals: number };
  logoUrl: string;
  wrappedNative: `0x${string}`;
  isCustom?: boolean;
  swap: {
    v1Router: `0x${string}`;
    v1Factory: `0x${string}`;
    v2SwapRouter: `0x${string}`;
    v2Quoter: `0x${string}`;
  };
}

const ZERO_ADDR: `0x${string}` = '0x0000000000000000000000000000000000000000';

export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://cloudflare-eth.com',
    explorerUrl: 'https://etherscan.io',
    nativeToken: { symbol: 'ETH', decimals: 18 },
    logoUrl: 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png',
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    swap: {
      v1Router: '0x03f7724180AA6b939894B5Ca4314783B0b36b329',
      v1Factory: '0x115934131916C8b277DD010Ee02de363c09d037c',
      v2SwapRouter: '0xB2eCc25C0B3af0039d4d9dDDfCeC19e958618963',
      v2Quoter: '0x486dD4Ff6abD5B2f728192cda291D2ffb611CBD1',
    },
  },
  shibarium: {
    chainId: 109,
    name: 'Shibarium',
    rpcUrl: 'https://www.shibrpc.com',
    explorerUrl: 'https://shibariumscan.io',
    nativeToken: { symbol: 'BONE', decimals: 18 },
    logoUrl: 'https://assets.coingecko.com/coins/images/16916/thumb/bone_icon.png',
    wrappedNative: '0xC76F4c819D820369Fb2d7C1531aB3Bb18e6fE8d8',
    swap: {
      v1Router: '0xEF83bbB63E8A7442E3a4a5d28d9bBf32D7c813c8',
      v1Factory: '0xc2b4218F137e3A5A9B98ab3AE804108F0D312CBC',
      v2SwapRouter: '0xd0d020fd91aB1Ab2CbbdbfBde2Fd9C5e4D5896b8',
      v2Quoter: '0x9dab43E3DbEF5241f491818077E12E21b02D7035',
    },
  },
};

const CUSTOM_NETWORKS_KEY = 'shibwallet_custom_networks';

function loadCustomNetworks(): Record<string, NetworkConfig> {
  try {
    const raw = localStorage.getItem(CUSTOM_NETWORKS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCustomNetworks(networks: Record<string, NetworkConfig>) {
  localStorage.setItem(CUSTOM_NETWORKS_KEY, JSON.stringify(networks));
}

export function getAllNetworks(): Record<string, NetworkConfig> {
  return { ...DEFAULT_NETWORKS, ...loadCustomNetworks() };
}

// Keep NETWORKS as a getter for backward compat
export const NETWORKS = new Proxy({} as Record<string, NetworkConfig>, {
  get(_target, prop: string) {
    return getAllNetworks()[prop];
  },
  ownKeys() {
    return Object.keys(getAllNetworks());
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    const nets = getAllNetworks();
    if (prop in nets) {
      return { configurable: true, enumerable: true, value: nets[prop] };
    }
    return undefined;
  },
  has(_target, prop: string) {
    return prop in getAllNetworks();
  },
});

export function addCustomNetwork(network: {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  nativeDecimals?: number;
}): string {
  const key = `custom_${network.chainId}`;
  const custom = loadCustomNetworks();
  custom[key] = {
    chainId: network.chainId,
    name: network.name,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
    nativeToken: { symbol: network.nativeSymbol, decimals: network.nativeDecimals ?? 18 },
    logoUrl: '',
    wrappedNative: ZERO_ADDR,
    isCustom: true,
    swap: {
      v1Router: ZERO_ADDR,
      v1Factory: ZERO_ADDR,
      v2SwapRouter: ZERO_ADDR,
      v2Quoter: ZERO_ADDR,
    },
  };
  saveCustomNetworks(custom);
  return key;
}

export function removeCustomNetwork(key: string): boolean {
  const custom = loadCustomNetworks();
  if (!(key in custom)) return false;
  delete custom[key];
  saveCustomNetworks(custom);
  return true;
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(getAllNetworks()).find((n) => n.chainId === chainId);
}

export function getNetworkKey(chainId: number): string {
  const all = getAllNetworks();
  for (const [key, net] of Object.entries(all)) {
    if (net.chainId === chainId) return key;
  }
  return 'ethereum';
}

export function getExplorerTxUrl(chainId: number, hash: string): string {
  const network = getNetworkByChainId(chainId);
  return `${network?.explorerUrl || 'https://etherscan.io'}/tx/${hash}`;
}
