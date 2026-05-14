import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  encodeFunctionData,
  type Account,
  type Chain,
  parseUnits,
  maxUint256,
} from 'viem';
import { mainnet } from 'viem/chains';
import { type NetworkConfig, getNetworkByChainId } from './chains';
import { type TokenInfo, isNativeToken } from './tokens';
import { ERC20_ABI, ROUTER_V1_ABI, FACTORY_V1_ABI, QUOTER_V2_ABI, SWAP_ROUTER_V2_ABI } from './abis';

const ZERO_ADDRESS: `0x${string}` = '0x0000000000000000000000000000000000000000';
const DEFAULT_DEADLINE_SECONDS = 1200; // 20 minutes
const V2_FEE_TIERS = [3000, 10000, 500] as const; // 0.3%, 1%, 0.05%

export type SwapVersion = 'v1' | 'v2';

export interface QuoteResult {
  amountOut: bigint;
  path: `0x${string}`[];
  priceImpact: number;
  version: SwapVersion;
  fee?: number;
}

export interface BestQuoteResult {
  best: QuoteResult;
  v1: QuoteResult | null;
  v2: QuoteResult | null;
}

function buildViemChain(network: NetworkConfig): Chain {
  const allRpcs = [network.rpcUrl, ...(network.rpcFallbacks ?? [])];
  return {
    id: network.chainId,
    name: network.name,
    nativeCurrency: {
      name: network.nativeToken.symbol,
      symbol: network.nativeToken.symbol,
      decimals: network.nativeToken.decimals,
    },
    rpcUrls: {
      default: { http: allRpcs },
    },
    blockExplorers: {
      default: { name: network.name, url: network.explorerUrl },
    },
  };
}

function buildTransport(network: NetworkConfig) {
  const allRpcs = [network.rpcUrl, ...(network.rpcFallbacks ?? [])];
  return allRpcs.length > 1
    ? fallback(allRpcs.map((url) => http(url, { timeout: 5_000 })))
    : http(allRpcs[0], { timeout: 5_000 });
}

function getClients(network: NetworkConfig, account?: Account) {
  const chain = buildViemChain(network);
  const transport = buildTransport(network);

  const publicClient = createPublicClient({ chain, transport });

  const walletClient = account
    ? createWalletClient({ chain, transport, account })
    : undefined;

  return { publicClient, walletClient, chain };
}

function resolveTokenAddress(token: TokenInfo, network: NetworkConfig): `0x${string}` {
  if (isNativeToken(token)) {
    return network.wrappedNative;
  }
  return token.address;
}

async function pairExists(
  network: NetworkConfig,
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
): Promise<boolean> {
  const { publicClient } = getClients(network);

  const pair = await publicClient.readContract({
    address: network.swap.v1Factory,
    abi: FACTORY_V1_ABI,
    functionName: 'getPair',
    args: [tokenA, tokenB],
  });

  return pair !== ZERO_ADDRESS;
}

function buildPath(
  tokenInAddress: `0x${string}`,
  tokenOutAddress: `0x${string}`,
  wrappedNative: `0x${string}`,
  useWrappedRoute: boolean,
): `0x${string}`[] {
  if (useWrappedRoute) {
    return [tokenInAddress, wrappedNative, tokenOutAddress];
  }
  return [tokenInAddress, tokenOutAddress];
}

async function computePriceImpact(
  publicClient: ReturnType<typeof createPublicClient>,
  routerAddress: `0x${string}`,
  path: `0x${string}`[],
  amountIn: bigint,
  amountOut: bigint,
  tokenInDecimals: number,
): Promise<number> {
  const oneUnit = parseUnits('1', tokenInDecimals);
  try {
    const smallAmounts = await publicClient.readContract({
      address: routerAddress,
      abi: ROUTER_V1_ABI,
      functionName: 'getAmountsOut',
      args: [oneUnit, path],
    });
    const smallOut = smallAmounts[smallAmounts.length - 1];
    const idealRate = Number(amountIn) / Number(amountOut);
    const smallRate = Number(oneUnit) / Number(smallOut);
    if (smallRate > 0) {
      return Math.round(Math.abs((idealRate - smallRate) / smallRate) * 10000) / 100;
    }
  } catch {}
  return 0;
}

// ── V1 Quote ──

export async function getV1Quote(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
): Promise<QuoteResult> {
  const network = getNetworkByChainId(chainId);
  if (!network) throw new Error(`Unsupported chain: ${chainId}`);

  const { publicClient } = getClients(network);
  const tokenInAddress = resolveTokenAddress(tokenIn, network);
  const tokenOutAddress = resolveTokenAddress(tokenOut, network);

  const directPairExists = await pairExists(network, tokenInAddress, tokenOutAddress);
  const path = buildPath(tokenInAddress, tokenOutAddress, network.wrappedNative, !directPairExists);

  const amounts = await publicClient.readContract({
    address: network.swap.v1Router,
    abi: ROUTER_V1_ABI,
    functionName: 'getAmountsOut',
    args: [amountIn, path],
  });

  const amountOut = amounts[amounts.length - 1];
  const priceImpact = await computePriceImpact(
    publicClient, network.swap.v1Router, path, amountIn, amountOut, tokenIn.decimals,
  );

  return { amountOut, path, priceImpact, version: 'v1' };
}

// ── V2 Quote (Uniswap V3 style) ──

export async function getV2Quote(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
): Promise<QuoteResult> {
  const network = getNetworkByChainId(chainId);
  if (!network) throw new Error(`Unsupported chain: ${chainId}`);
  if (network.swap.v2Quoter === ZERO_ADDRESS) throw new Error('V2 not available');

  const { publicClient } = getClients(network);
  const tokenInAddress = resolveTokenAddress(tokenIn, network);
  const tokenOutAddress = resolveTokenAddress(tokenOut, network);

  let bestOut = 0n;
  let bestFee = 3000;

  for (const fee of V2_FEE_TIERS) {
    try {
      const result = await publicClient.simulateContract({
        address: network.swap.v2Quoter,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const out = result.result[0];
      if (out > bestOut) {
        bestOut = out;
        bestFee = fee;
      }
    } catch {
      // This fee tier has no pool — skip
    }
  }

  if (bestOut === 0n) throw new Error('No V2 liquidity for this pair');

  // Approximate price impact for V2
  let priceImpact = 0;
  const oneUnit = parseUnits('1', tokenIn.decimals);
  if (oneUnit < amountIn) {
    try {
      const smallResult = await publicClient.simulateContract({
        address: network.swap.v2Quoter,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          amountIn: oneUnit,
          fee: bestFee,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const smallOut = smallResult.result[0];
      const idealRate = Number(amountIn) / Number(bestOut);
      const smallRate = Number(oneUnit) / Number(smallOut);
      if (smallRate > 0) {
        priceImpact = Math.round(Math.abs((idealRate - smallRate) / smallRate) * 10000) / 100;
      }
    } catch {}
  }

  return {
    amountOut: bestOut,
    path: [tokenInAddress, tokenOutAddress],
    priceImpact,
    version: 'v2',
    fee: bestFee,
  };
}

// ── Best Quote (compares V1 and V2) ──

export async function getBestQuote(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
  preferredVersion?: SwapVersion,
): Promise<BestQuoteResult> {
  const [v1Result, v2Result] = await Promise.allSettled([
    getV1Quote(chainId, tokenIn, tokenOut, amountIn),
    getV2Quote(chainId, tokenIn, tokenOut, amountIn),
  ]);

  const v1 = v1Result.status === 'fulfilled' ? v1Result.value : null;
  const v2 = v2Result.status === 'fulfilled' ? v2Result.value : null;

  if (!v1 && !v2) throw new Error('No liquidity found on V1 or V2');

  if (preferredVersion === 'v1' && v1) return { best: v1, v1, v2 };
  if (preferredVersion === 'v2' && v2) return { best: v2, v1, v2 };

  if (v1 && v2) {
    return { best: v1.amountOut >= v2.amountOut ? v1 : v2, v1, v2 };
  }

  return { best: (v1 ?? v2)!, v1, v2 };
}

// ── Allowance & Approval ──

export async function getTokenAllowance(
  chainId: number,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
): Promise<bigint> {
  const network = getNetworkByChainId(chainId);
  if (!network) throw new Error(`Unsupported chain: ${chainId}`);

  const { publicClient } = getClients(network);
  return publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  });
}

export async function approveToken(
  chainId: number,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amount: bigint,
  account: Account,
): Promise<`0x${string}`> {
  const network = getNetworkByChainId(chainId);
  if (!network) throw new Error(`Unsupported chain: ${chainId}`);

  const { publicClient, walletClient } = getClients(network, account);
  if (!walletClient) throw new Error('Wallet client not available');

  const chain = buildViemChain(network);
  const [gasPrice, nonce] = await Promise.all([
    publicClient.getGasPrice(),
    publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
  ]);

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, maxUint256],
    gasPrice,
    nonce,
    chain,
    account,
  });

  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 2_000 });
  return hash;
}

// ── Swap Execution ──

export function getRouterAddress(chainId: number, version: SwapVersion): `0x${string}` {
  const network = getNetworkByChainId(chainId);
  if (!network) throw new Error(`Unsupported chain: ${chainId}`);
  return version === 'v2' ? network.swap.v2SwapRouter : network.swap.v1Router;
}

export async function executeSwap(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
  amountOutMin: bigint,
  account: Account,
  version: SwapVersion = 'v1',
  fee?: number,
  deadline?: bigint,
): Promise<`0x${string}`> {
  if (version === 'v2') {
    return executeV2Swap(chainId, tokenIn, tokenOut, amountIn, amountOutMin, account, fee ?? 3000, deadline);
  }
  return executeV1Swap(chainId, tokenIn, tokenOut, amountIn, amountOutMin, account, deadline);
}

async function executeV1Swap(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
  amountOutMin: bigint,
  account: Account,
  deadline?: bigint,
): Promise<`0x${string}`> {
  const network = getNetworkByChainId(chainId);
  if (!network) throw new Error(`Unsupported chain: ${chainId}`);

  const { publicClient, walletClient } = getClients(network, account);
  if (!walletClient) throw new Error('Wallet client not available');

  const swapDeadline = deadline ?? BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  const routerAddress = network.swap.v1Router;
  const inputIsNative = isNativeToken(tokenIn);
  const outputIsNative = isNativeToken(tokenOut);

  const tokenInAddress = resolveTokenAddress(tokenIn, network);
  const tokenOutAddress = resolveTokenAddress(tokenOut, network);

  const directPairExists = await pairExists(network, tokenInAddress, tokenOutAddress);
  const path = buildPath(tokenInAddress, tokenOutAddress, network.wrappedNative, !directPairExists);

  const chain = buildViemChain(network);
  const [gasPrice, nonce] = await Promise.all([
    publicClient.getGasPrice(),
    publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
  ]);

  if (inputIsNative) {
    return walletClient.writeContract({
      address: routerAddress,
      abi: ROUTER_V1_ABI,
      functionName: 'swapExactETHForTokens',
      args: [amountOutMin, path, account.address, swapDeadline],
      value: amountIn,
      gasPrice,
      nonce,
      chain,
      account,
    });
  }

  if (outputIsNative) {
    return walletClient.writeContract({
      address: routerAddress,
      abi: ROUTER_V1_ABI,
      functionName: 'swapExactTokensForETH',
      args: [amountIn, amountOutMin, path, account.address, swapDeadline],
      gasPrice,
      nonce,
      chain,
      account,
    });
  }

  return walletClient.writeContract({
    address: routerAddress,
    abi: ROUTER_V1_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [amountIn, amountOutMin, path, account.address, swapDeadline],
    gasPrice,
    nonce,
    chain,
    account,
  });
}

async function executeV2Swap(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
  amountOutMin: bigint,
  account: Account,
  fee: number,
  deadline?: bigint,
): Promise<`0x${string}`> {
  const network = getNetworkByChainId(chainId);
  if (!network) throw new Error(`Unsupported chain: ${chainId}`);

  const { publicClient, walletClient } = getClients(network, account);
  if (!walletClient) throw new Error('Wallet client not available');

  const swapDeadline = deadline ?? BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  const routerAddress = network.swap.v2SwapRouter;
  const inputIsNative = isNativeToken(tokenIn);
  const outputIsNative = isNativeToken(tokenOut);
  const tokenInAddress = resolveTokenAddress(tokenIn, network);
  const tokenOutAddress = resolveTokenAddress(tokenOut, network);

  const chain = buildViemChain(network);
  const [gasPrice, nonce] = await Promise.all([
    publicClient.getGasPrice(),
    publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
  ]);

  const recipient = outputIsNative ? routerAddress : account.address;

  const swapCalldata = encodeFunctionData({
    abi: SWAP_ROUTER_V2_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
      fee,
      recipient,
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: 0n,
    }],
  });

  const calls: `0x${string}`[] = [swapCalldata];

  if (outputIsNative) {
    calls.push(
      encodeFunctionData({
        abi: SWAP_ROUTER_V2_ABI,
        functionName: 'unwrapWETH9',
        args: [amountOutMin, account.address],
      }),
    );
  }

  return walletClient.writeContract({
    address: routerAddress,
    abi: SWAP_ROUTER_V2_ABI,
    functionName: 'multicall',
    args: [swapDeadline, calls],
    value: inputIsNative ? amountIn : 0n,
    gasPrice,
    nonce,
    chain,
    account,
  });
}
