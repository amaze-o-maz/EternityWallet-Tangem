# ShibWallet

A non-custodial cryptocurrency wallet built for the Shiba Inu ecosystem. Manage your SHIB, BONE, LEASH, TREAT, and other tokens across Ethereum and Shibarium networks — all from a single mobile-first app.

## Features

### Wallet
- **Non-custodial** — your keys, your crypto. Private keys never leave your device
- **Multi-account** — import multiple private keys and switch between accounts
- **Multi-network** — Ethereum & Shibarium built-in, plus add custom EVM networks
- **Token management** — default Shiba ecosystem tokens + add any ERC-20 by contract address
- **Fast balance loading** — batched multicall RPC for instant Shibarium token balances

### ShibaSwap Integration
- Built-in swap tab powered by ShibaSwap DEX
- Native token swap interface with Shiba Inu branding

### dApp Browser
- Explore 15+ curated Shibarium dApps
- In-app browser with full Web3 wallet injection (EIP-1193)
- Connect to any dApp directly from within the wallet
- Native Android WebView with `window.ethereum` provider

### Security
- **PBKDF2 key derivation** — 100,000 iterations with SHA-256, random 128-bit salt
- **AES-256-CBC encryption** — vault and accounts encrypted with explicit IV
- **Encrypted accounts storage** — all private keys encrypted at rest, decrypted only while unlocked
- **Unlock rate limiting** — exponential backoff after 5 failed attempts (up to 5-minute lockout)
- **Auto-lock** — wallet locks after inactivity
- **Backward-compatible** — seamlessly handles legacy vault formats

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Blockchain | viem (multicall, contract reads) |
| Crypto | @scure/bip39, @scure/bip32, crypto-js |
| Mobile | Capacitor (Android) |
| dApp Browser | Android WebView + JavaScript injection |
| Build | Vite |

## Getting Started

### Prerequisites
- Node.js 18+
- Android SDK (for mobile builds)

### Install & Run

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
│   ├── components/     # UI components (TokenList, NetworkBadge, AddressPill, BottomNav)
│   ├── lib/            # Core logic (wallet crypto, chains, tokens, dApp browser bridge)
│   ├── pages/          # Route pages (Wallet, Swap, DApps, DAppBrowser, Lock, Create, Import)
│   └── store/          # Zustand stores (wallet, network, balance)
├── android/            # Capacitor Android project with native WebView dApp browser
└── dist/               # Production build output
```

## Security Model

- **Vault** — mnemonic/private key encrypted with PBKDF2-derived key, stored as `salt:iv:ciphertext`
- **Accounts** — full account array (addresses, keys, labels) encrypted with the same password
- **Memory** — password held in Zustand state only while unlocked, cleared on lock
- **Rate limiting** — exponential backoff on failed unlock attempts prevents brute force

## Supported Networks

| Network | Chain ID | Native Token |
|---------|----------|-------------|
| Ethereum | 1 | ETH |
| Shibarium | 109 | BONE |
| Custom | Any | Configurable |

## Default Tokens

**Ethereum:** SHIB, BONE, LEASH, TREAT

**Shibarium:** SHIB, LEASH, TREAT, WBONE, WETH, DAI, USDC, USDT

## License

This project is proprietary software. All rights reserved.
