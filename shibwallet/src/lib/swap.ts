import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  type Account,
  type Chain,
  parseUnits,
  maxUint256,
} from 'viem';
import { mainnet } from 'viem/chains';
import { type NetworkConfig, getNetworkByChainId } from './chains';
import { type TokenInfo, isNativeToken } from './tokens';
import { ERC20_ABI, ROUTER_V1_ABI, FACTORY_V1_ABI } from './abis';

const ZERO_ADDRESS: `0x${string}` = '0x0000000000000000000000000000000000000000';
const DEFAULT_DEADLINE_SECONDS = 1200; // 20 minutes

interface QuoteResult {
  amountOut: bigint;
  path: `0x${string}`[];
  priceImpact: number;
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

export async function getV1Quote(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
): Promise<QuoteResult> {
  const network = getNetworkByChainId(chainId);
  if (!network) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const { publicClient } = getClients(network);
  const tokenInAddress = resolveTokenAddress(tokenIn, network);
  const tokenOutAddress = resolveTokenAddress(tokenOut, network);

  const directPairExists = await pairExists(network, tokenInAddress, tokenOutAddress);

  let path: `0x${string}`[];
  if (directPairExists) {
    path = buildPath(tokenInAddress, tokenOutAddress, network.wrappedNative, false);
  } else {
    path = buildPath(tokenInAddress, tokenOutAddress, network.wrappedNative, true);
  }

  const amounts = await publicClient.readContract({
    address: network.swap.v1Router,
    abi: ROUTER_V1_ABI,
    functionName: 'getAmountsOut',
    args: [amountIn, path],
  });

  const amountOut = amounts[amounts.length - 1];

  // Calculate approximate price impact using mid-price deviation
  // A precise calculation would require reserve queries, but this gives a reasonable estimate
  const idealRate = Number(amountIn) / Number(amountOut);
  const oneUnit = parseUnits('1', tokenIn.decimals);

  let priceImpact = 0;
  try {
    const smallAmounts = await publicClient.readContract({
      address: network.swap.v1Router,
      abi: ROUTER_V1_ABI,
      functionName: 'getAmountsOut',
      args: [oneUnit, path],
    });
    const smallOut = smallAmounts[smallAmounts.length - 1];
    const smallRate = Number(oneUnit) / Number(smallOut);

    if (smallRate > 0) {
      priceImpact = Math.abs((idealRate - smallRate) / smallRate) * 100;
    }
  } catch {
    // If small quote fails, price impact is unknown; default to 0
    priceImpact = 0;
  }

  return {
    amountOut,
    path,
    priceImpact: Math.round(priceImpact * 100) / 100,
  };
}

export async function getTokenAllowance(
  chainId: number,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
): Promise<bigint> {
  const network = getNetworkByChainId(chainId);
  if (!network) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const { publicClient } = getClients(network);

  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  });

  return allowance;
}

export async function approveToken(
  chainId: number,
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amount: bigint,
  account: Account,
): Promise<`0x${string}`> {
  const network = getNetworkByChainId(chainId);
  if (!network) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const { publicClient, walletClient } = getClients(network, account);
  if (!walletClient) {
    throw new Error('Wallet client not available');
  }

  const chain = buildViemChain(network);
  const gasPrice = await publicClient.getGasPrice();

  // Approve max to avoid repeated approvals
  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, maxUint256],
    gasPrice,
    chain,
    account,
  });

  // Wait for the approval tx to be mined (needed before swap can proceed)
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 2_000 });

  return hash;
}

export async function executeSwap(
  chainId: number,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
  amountOutMin: bigint,
  account: Account,
  deadline?: bigint,
): Promise<`0x${string}`> {
  const network = getNetworkByChainId(chainId);
  if (!network) {
    throw new Error(`Unsupported chain: ${chainId}`);
  }

  const { publicClient, walletClient } = getClients(network, account);
  if (!walletClient) {
    throw new Error('Wallet client not available');
  }

  const swapDeadline = deadline ?? BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  const routerAddress = network.swap.v1Router;
  const inputIsNative = isNativeToken(tokenIn);
  const outputIsNative = isNativeToken(tokenOut);

  const tokenInAddress = resolveTokenAddress(tokenIn, network);
  const tokenOutAddress = resolveTokenAddress(tokenOut, network);

  const directPairExists = await pairExists(network, tokenInAddress, tokenOutAddress);
  const path = buildPath(
    tokenInAddress,
    tokenOutAddress,
    network.wrappedNative,
    !directPairExists,
  );

  const chain = buildViemChain(network);

  // Fetch gas price upfront — Shibarium uses legacy gas pricing
  const gasPrice = await publicClient.getGasPrice();

  if (inputIsNative) {
    // Native -> Token: use swapExactETHForTokens
    return walletClient.writeContract({
      address: routerAddress,
      abi: ROUTER_V1_ABI,
      functionName: 'swapExactETHForTokens',
      args: [amountOutMin, path, account.address, swapDeadline],
      value: amountIn,
      gasPrice,
      chain,
      account,
    });
  }

  if (outputIsNative) {
    // Token -> Native: use swapExactTokensForETH
    return walletClient.writeContract({
      address: routerAddress,
      abi: ROUTER_V1_ABI,
      functionName: 'swapExactTokensForETH',
      args: [amountIn, amountOutMin, path, account.address, swapDeadline],
      gasPrice,
      chain,
      account,
    });
  }

  // Token -> Token: use swapExactTokensForTokens
  return walletClient.writeContract({
    address: routerAddress,
    abi: ROUTER_V1_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [amountIn, amountOutMin, path, account.address, swapDeadline],
    gasPrice,
    chain,
    account,
  });
}
