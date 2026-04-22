# ShibWallet (Eternity Wallet)

A non-custodial cryptocurrency wallet built for the Shiba Inu ecosystem. Manage your SHIB, BONE, LEASH, TREAT, and other tokens across Ethereum and Shibarium networks — all from a single mobile-first app.

## Features

### Wallet
- **Non-custodial** — your keys, your crypto. Private keys never leave your device
- **Multi-account** — create via mnemonic or import private keys, switch between accounts
- **Multi-network** — Ethereum & Shibarium built-in, plus add custom EVM networks
- **Token management** — default Shiba ecosystem tokens + add any ERC-20 by contract address
- **NFT gallery** — view ERC-721, ERC-1155, and DN-404 NFTs on Ethereum and Shibarium with metadata & images
- **Fast balance loading** — batched multicall RPC for instant token balances
- **Live prices** — real-time USD prices via CoinGecko with 7-day sparkline charts
- **QR receive** — generate QR codes for easy address sharing
- **Instant cache hydration** — NFTs, transaction history, and news load instantly from localStorage on re-open, with silent background revalidation

### Send & Receive
- Send native tokens (ETH, BONE) and any ERC-20 token
- **NFT sending** — long-press to select NFTs in collection view, then send
  - ERC-1155: multi-select with native `safeBatchTransferFrom` (one tx, one signature)
  - ERC-721 / DN-404: single-select with `safeTransferFrom`
- **SNS (.shib) name resolution** — send to `name.shib` addresses on Shibarium via Shib Name Service
- **ENS name resolution** — send to `name.eth` addresses on Ethereum via ensideas.com API + viem fallback
- Gas estimation with fees shown in both native token and USD
- Transaction review modal before confirming
- Success notification with transaction hash, copy button, and explorer link
- Full transaction history with local persistence (sends, swaps, NFT sends, and on-chain activity)

### ShibaSwap Integration
- Built-in swap tab powered by ShibaSwap V1 router contracts
- Auto-quoting with debounced input and price impact display
- Configurable slippage tolerance
- Token approval flow with progress indicators
- Swap confirmation with minimum received calculation
- Support for Native-to-Token, Token-to-Native, and Token-to-Token swaps

### ShibFi — Market Intelligence
- **Road to $0.01** hero with live zero-countdown and 24h price change
- **Real-time signals engine** — prioritized alerts for burn acceleration, funding extremes, volume surges, exchange whale flows, holder growth, DeFi dominance, and price moves
- **Indicator pills** — at-a-glance burn trend, market pressure, and momentum status
- **Volume & range bar** — 24h high/low with current price marker
- **Funding & open interest** — multi-exchange aggregated OI with per-exchange breakdown
- **Exchange flows** — 24h inflow/outflow with recent whale move details (tap for full tx info + Etherscan link)
- **Shibarium network stats** — live transaction count, blocks, addresses, and block time
- **Ecosystem holders** — combined Ethereum + Shibarium holder counts for SHIB, BONE, LEASH, TREAT
- Auto-refresh every 60s with visibility-aware revalidation and localStorage caching

### SHIB Burns Tracker (Hall of Flame)
- Real-time SHIB burn statistics — total burned, burn rate, recent burns
- Leaderboard of top burners with ENS/SNS name resolution
- Time period filtering (24h, 7d, 30d, all-time)
- Cached data with background refresh for fast tab switching

### News & Magazine
- Shiba Inu ecosystem news feed powered by WordPress API
- Magazine articles with featured images, authors, and categories
- Paginated infinite scroll with pull-to-refresh
- Cached with TTL-based revalidation and visibility listeners for app resume

### Buy
- Fiat on-ramp integration for purchasing crypto

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
| State | Zustand (wallet, network, balance, transaction, burn, news, NFT selection stores) |
| Blockchain | viem (multicall, contract reads/writes, gas estimation, ERC-721/1155 transfers) |
| Swap | ShibaSwap V1 router contracts (on-chain) |
| Prices | CoinGecko API (live prices + 7-day sparklines) |
| NFTs | Blockscout v2 API (Ethereum & Shibarium) + on-chain tokenURI |
| Name Resolution | SNS (Shib Name Service via Cloudflare DoH), ENS (ensideas.com + viem fallback) |
| News | WordPress REST API with embedded media |
| Burns | Etherscan API + custom burn tracking |
| Market Intelligence | Binance, OKX, Bybit (funding/OI/ticker), Whale Alert (exchange flows), DexScreener (DeFi dominance) |
| Shibarium Stats | Shibariumscan API (network stats + token holders) |
| Crypto | @scure/bip39, @scure/bip32, crypto-js |
| Mobile | Capacitor (Android) |
| dApp Browser | Android WebView + JavaScript injection (EIP-1193) |
| Icons | Lucide React |
| Toasts | react-hot-toast |
| QR Codes | qrcode.react |
| Build | Vite |

## Getting Started

### For Android — Simply Install the APK

Download `ShibWallet.apk` from the repository root and install on your device.

---

### For Local Development

#### Prerequisites
- Node.js 18+
- Android SDK (for mobile builds)

#### Install & Run (Web)

```bash
cd shibwallet
npm install
npm run dev
```

#### Build for Production

```bash
npm run build
```

#### Android APK

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
│   ├── components/        # Reusable UI
│   │   ├── NFTGallery.tsx #   NFT grid with collection drill-down + long-press selection
│   │   ├── ShibName.tsx   #   SNS/ENS name display component
│   │   ├── TokenList.tsx  #   Token balance rows with sparklines
│   │   ├── ReviewModal.tsx #  Confirm modal for sends/swaps
│   │   ├── TokenSelector.tsx # Token picker modal
│   │   ├── Sparkline.tsx  #   7-day price chart
│   │   ├── Header.tsx     #   App header with account switcher + network badge
│   │   ├── BottomNav.tsx  #   Tab navigation
│   │   ├── WalletLayout.tsx #  Persistent layout wrapper
│   │   ├── AddressPill.tsx #  Copyable address display
│   │   ├── NetworkBadge.tsx # Chain indicator
│   │   ├── QRCode.tsx     #   QR code generator
│   │   └── ...
│   ├── lib/               # Core logic
│   │   ├── wallet.ts      #   Key generation, encryption, PBKDF2 vault
│   │   ├── chains.ts      #   Network configs (Ethereum, Shibarium, custom)
│   │   ├── tokens.ts      #   Token registry, custom token import
│   │   ├── swap.ts        #   ShibaSwap router integration (quotes, approvals, swaps)
│   │   ├── prices.ts      #   CoinGecko price + sparkline fetching
│   │   ├── abis.ts        #   Contract ABIs (ERC-20, ERC-721, ERC-1155, Router, Factory)
│   │   ├── ens.ts         #   ENS reverse resolution (ensideas.com + viem fallback, 24h cache)
│   │   ├── sns.ts         #   SNS (.shib) name resolution via Cloudflare DoH
│   │   ├── burns.ts       #   SHIB burn data fetching + aggregation
│   │   ├── marketData.ts  #   Funding rates, open interest, ticker data
│   │   ├── exchangeFlows.ts # Exchange inflow/outflow + whale move tracking
│   │   ├── defiDominance.ts # SHIB vs memecoin DEX volume (DexScreener)
│   │   ├── shibarium.ts   #   Shibarium network stats + token holders
│   │   ├── shibfiSignals.ts # Signal engine (burn, funding, volume, holder, flow alerts)
│   │   └── dappBrowser.ts #   EIP-1193 provider injection for WebView
│   ├── pages/             # Route pages
│   │   ├── Wallet.tsx     #   Main dashboard (balances, tokens, NFTs)
│   │   ├── Send.tsx       #   Token sending with gas estimation + SNS support
│   │   ├── SendNft.tsx    #   NFT sending (ERC-721 single / ERC-1155 batch)
│   │   ├── Receive.tsx    #   QR code + address display
│   │   ├── Swap.tsx       #   ShibaSwap DEX interface
│   │   ├── History.tsx    #   Transaction history (on-chain + local, cached)
│   │   ├── Burns.tsx      #   SHIB burn tracker / Hall of Flame leaderboard
│   │   ├── ShibFi.tsx     #   Market Intelligence dashboard
│   │   ├── Magazine.tsx   #   Shiba ecosystem news feed
│   │   ├── Buy.tsx        #   Fiat on-ramp
│   │   ├── DApps.tsx      #   Curated dApp directory
│   │   ├── DAppBrowser.tsx #  In-app Web3 browser
│   │   ├── Lock.tsx       #   Unlock screen with rate limiting
│   │   ├── Create.tsx     #   New wallet (mnemonic generation)
│   │   ├── Import.tsx     #   Import via mnemonic or private key
│   │   └── Onboarding.tsx #   Splash + welcome screen
│   └── store/             # Zustand stores
│       ├── walletStore.ts        # Accounts, vault, lock/unlock
│       ├── networkStore.ts       # Active chain, custom networks
│       ├── transactionStore.ts   # Local transaction persistence (sends, swaps, NFT sends)
│       ├── burnStore.ts          # SHIB burn data cache
│       ├── newsStore.ts          # News/magazine article cache with localStorage persistence
│       ├── nftSelectionStore.ts  # Ephemeral NFT selection state for send flow
│       ├── shibfiStore.ts         # ShibFi market data cache + parallel fetching
│       ├── snsStore.ts           # SNS name cache
│       └── themeStore.ts         # Theme preferences
├── android/               # Capacitor Android project with native WebView dApp browser
└── dist/                  # Production build output
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

This project is for SHIBARMYSTRONGAF only — all rights reserved.
