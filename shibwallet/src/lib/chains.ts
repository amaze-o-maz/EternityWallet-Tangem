export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeToken: { symbol: string; decimals: number };
  logoUrl: string;
  wrappedNative: `0x${string}`;
  swap: {
    v1Router: `0x${string}`;
    v1Factory: `0x${string}`;
    v2SwapRouter: `0x${string}`;
    v2Quoter: `0x${string}`;
  };
}

export const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://cloudflare-eth.com',
    explorerUrl: 'https://etherscan.io',
    nativeToken: { symbol: 'ETH', decimals: 18 },
    logoUrl: 'https://cdn.shib.io/tokens/images/1/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2.png',
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
    logoUrl: 'https://cdn.shib.io/tokens/images/109/0x0000000000000000000000000000000000001010.png',
    wrappedNative: '0xC76F4c819D820369Fb2d7C1531aB3Bb18e6fE8d8',
    swap: {
      v1Router: '0xEF83bbB63E8A7442E3a4a5d28d9bBf32D7c813c8',
      v1Factory: '0xc2b4218F137e3A5A9B98ab3AE804108F0D312CBC',
      v2SwapRouter: '0xd0d020fd91aB1Ab2CbbdbfBde2Fd9C5e4D5896b8',
      v2Quoter: '0x9dab43E3DbEF5241f491818077E12E21b02D7035',
    },
  },
};

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}

export function getNetworkKey(chainId: number): string {
  return chainId === 109 ? 'shibarium' : 'ethereum';
}

export function getExplorerTxUrl(chainId: number, hash: string): string {
  const network = getNetworkByChainId(chainId);
  return `${network?.explorerUrl || 'https://etherscan.io'}/tx/${hash}`;
}
