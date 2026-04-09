# ShibWallet

A non-custodial cryptocurrency wallet built for the Shiba Inu ecosystem. Manage your SHIB, BONE, LEASH, TREAT, and other tokens across Ethereum and Shibarium networks — all from a single mobile-first app.

## Features

### Wallet
- **Non-custodial** — your keys, your crypto. Private keys never leave your device
- **Multi-account** — create via mnemonic or import private keys, switch between accounts
- **Multi-network** — Ethereum & Shibarium built-in, plus add custom EVM networks
- **Token management** — default Shiba ecosystem tokens + add any ERC-20 by contract address
- **NFT gallery** — view ERC-721 and ERC-1155 NFTs on Ethereum and Shibarium with metadata & images
- **Fast balance loading** — batched multicall RPC for instant token balances
- **Live prices** — real-time USD prices via CoinGecko with 7-day sparkline charts
- **QR receive** — generate QR codes for easy address sharing

### Send & Receive
- Send native tokens (ETH, BONE) and any ERC-20 token
- Gas estimation with fees shown in both native token and USD
- Transaction review modal before confirming
- Success notification with transaction hash, copy button, and explorer link
- Full transaction history with local persistence (sends, swaps, and on-chain activity)

### ShibaSwap Integration
- Built-in swap tab powered by ShibaSwap V1 router contracts
- Auto-quoting with debounced input and price impact display
- Configurable slippage tolerance
- Token approval flow with progress indicators
- Swap confirmation with minimum received calculation
- Support for Native-to-Token, Token-to-Native, and Token-to-Token swaps

### dApp Browser
- 16 curated Shibarium dApps (ShibaSwap, SHIB The Metaverse, K9 Finance, and more)
- In-app browser with full Web3 wallet injection (EIP-1193)
- Connect to any dApp directly from within the wallet
- Native Android WebView with `window.ethereum` provider
- Transaction approval dialogs for dApp-initiated transactions

### Security
- **PBKDF2 key derivation** — 100,000 iterations with SHA-256, random 128-bit salt
- **AES-256-CBC encryption** — vault and accounts encrypted with explicit IV
- **Encrypted accounts storage** — all private keys encrypted at rest, decrypted only while unlocked
- **Unlock rate limiting** — exponential backoff after 5 failed attempts (up to 5-minute lockout)
- **Auto-lock** — wallet locks after 5 minutes of inactivity
- **Backward-compatible** — seamlessly handles legacy vault formats

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand (wallet, network, balance, transaction stores) |
| Blockchain | viem (multicall, contract reads/writes, gas estimation) |
| Swap | ShibaSwap V1 router contracts (on-chain) |
| Prices | CoinGecko API (live prices + 7-day sparklines) |
| NFTs | Etherscan API (ERC-721/1155) + Blockscout v2 (Shibarium) |
| Crypto | @scure/bip39, @scure/bip32, crypto-js |
| Mobile | Capacitor (Android) |
| dApp Browser | Android WebView + JavaScript injection (EIP-1193) |
| Icons | Lucide React |
| Toasts | react-hot-toast |
| QR Codes | qrcode.react |
| Build | Vite |

## Getting Started

### Install the APK

Download and install the APK directly on Android

### Prerequisites
- Node.js 18+
- Android SDK (for mobile builds)

### Install & Run (Web)

```bash
cd shibwallet
npm install
npm run dev
```

### Build for Production

```bash
npm run build
```

### Android APK

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Project Structure

```
shibwallet/
├── src/
│   ├── components/     # Reusable UI (TokenList, NFTGallery, Sparkline, Header, BottomNav,
│   │                   #   AddressPill, NetworkBadge, QRCode, TokenSelector, ReviewModal)
│   ├── lib/            # Core logic
│   │   ├── wallet.ts   #   Key generation, encryption, PBKDF2 vault
│   │   ├── chains.ts   #   Network configs (Ethereum, Shibarium, custom)
│   │   ├── tokens.ts   #   Token registry, custom token import
│   │   ├── swap.ts     #   ShibaSwap router integration (quotes, approvals, swaps)
│   │   ├── prices.ts   #   CoinGecko price + sparkline fetching
│   │   ├── abis.ts     #   Contract ABIs (ERC-20, Router, Factory, Multicall3)
│   │   └── dappBrowser.ts # EIP-1193 provider injection for WebView
│   ├── pages/          # Route pages
│   │   ├── Wallet.tsx  #   Main dashboard (balances, tokens, NFTs)
│   │   ├── Send.tsx    #   Token sending with gas estimation + success modal
│   │   ├── Receive.tsx #   QR code + address display
│   │   ├── Swap.tsx    #   ShibaSwap DEX interface
│   │   ├── History.tsx #   Transaction history (on-chain + local)
│   │   ├── DApps.tsx   #   Curated dApp directory
│   │   ├── DAppBrowser.tsx # In-app Web3 browser
│   │   ├── Lock.tsx    #   Unlock screen with rate limiting
│   │   ├── Create.tsx  #   New wallet (mnemonic generation)
│   │   ├── Import.tsx  #   Import via mnemonic or private key
│   │   └── Onboarding.tsx # Splash + welcome screen
│   └── store/          # Zustand stores
│       ├── walletStore.ts      # Accounts, vault, lock/unlock
│       ├── networkStore.ts     # Active chain, custom networks
│       └── transactionStore.ts # Local transaction persistence
├── android/            # Capacitor Android project with native WebView dApp browser
└── dist/               # Production build output
```

## Security Model

- **Vault** — mnemonic/private key encrypted with PBKDF2-derived key, stored as `salt:iv:ciphertext`
- **Accounts** — full account array (addresses, keys, labels) encrypted with the same password
- **Memory** — password held in Zustand state only while unlocked, cleared on lock
- **Rate limiting** — exponential backoff on failed unlock attempts prevents brute force
- **No external key servers** — all cryptographic operations happen locally on-device

## Supported Networks

| Network | Chain ID | Native Token | Explorer |
|---------|----------|-------------|----------|
| Ethereum | 1 | ETH | etherscan.io |
| Shibarium | 109 | BONE | shibariumscan.io |
| Custom | Any | Configurable | Configurable |

## Default Tokens

**Ethereum:** SHIB, BONE, LEASH, TREAT

**Shibarium:** SHIB, LEASH, TREAT, WBONE, WETH, DAI, USDC, USDT

## License

This project is for SHIBARMYSTRONGAF only all rights reserved
