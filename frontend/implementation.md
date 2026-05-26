# MorphSwift — Frontend implementation

This document describes how the MorphSwift merchant POS frontend is structured and how its pieces fit together.

## Overview

The frontend is a **static, multi-page** application: no build step required. Each view is a self-contained HTML file with embedded CSS and JavaScript for fast demos. Shared concerns are extracted into ES modules under `assets/js/` and a shared stylesheet stack under `assets/css/`.

| File | Role |
|------|------|
| `onboarding.html` | Merchant login (Google demo + magic-link email UI) |
| `terminal.html` | Fiat keypad, live stablecoin conversion, charge CTA |
| `checkout.html` | QR display, payment status, success overlay |
| `ledger.html` | Revenue stats, transaction list, withdraw modal |

## Configuration

`config.js` exports `CONFIG` and `apiUrl()`:

- **`apiBaseUrl`** — `http://localhost:4000/api` on localhost, otherwise `/api`
- **`brandName`** — `MorphSwift` (UI copy and manifest)
- **`storage`** — `localStorage` keys for session, merchant, and transaction history
- **`checkout`** — expiry (900s) and poll interval for chain listener

Import from page scripts:

```html
<script type="module">
  import { CONFIG, apiUrl } from './config.js';
</script>
```

## Stylesheet stack

Import order when refactoring pages off inline CSS:

1. `assets/css/tokens.css` — design tokens (`--amber`, `--surface`, fonts)
2. `assets/css/base.css` — reset, typography, layout primitives
3. `assets/css/components.css` — topbar, keypad, ledger rows, modals, etc.

Pages currently duplicate a subset of these tokens inline for standalone demos.

## JavaScript modules

| Module | Responsibility |
|--------|----------------|
| `assets/js/magic.js` | `POST /api/auth/session`, session persistence |
| `assets/js/priceFeeds.js` | Load `/api/config`, fiat→USD→stablecoin math, quotes |
| `assets/js/qrPayload.js` | `morphswift-pos-v1` base64url payloads, payment URIs |
| `assets/js/chainListener.js` | Poll checkout status; demo confirmation simulation |
| `assets/js/ledger.js` | Fetch merchant ledger, merge history, stats, CSV export |
| `assets/js/withdraw.js` | `POST /api/withdrawals`, fee estimate helper |

HTML pages still use inline scripts for the demo path. Modules are ready for `<script type="module">` wiring.

## Client-side storage

| Key | Content |
|-----|---------|
| `morphswift-session-token` | API session token |
| `morphswift-merchant` | Serialized merchant object |
| `morphswift-history` | Confirmed checkout records (max 100) |
| `chargeAmount`, `chargeUSD`, `chargeCurrency` | `sessionStorage` charge handoff terminal → checkout |

Legacy `payflow-history` is read as a fallback when migrating existing browsers.

## Terminal (`terminal.html`)

- Currency tabs: PHP, USD, NGN with hard-coded demo rates.
- Keypad updates fiat display and three stablecoin equivalents (USDC Polygon, USDT Ethereum, USDT Tron).
- **Charge** validates amount, writes `sessionStorage`, navigates to `checkout.html`.

## Checkout (`checkout.html`)

- Reads charge context from `sessionStorage`.
- Renders QR via CDN `qrcodejs` (local `lib/qrcode*.js` is optional).
- Token/network tabs swap wallet address and QR payload.
- **Demo mode:** `simulatePayment()` drives mempool → block → success UI without API.
- On success, appends a record to `morphswift-history` for the ledger.

## Ledger (`ledger.html`)

- Merges `morphswift-history` with embedded `DEMO_TXS`.
- Stats: today / 7-day revenue, mini bar chart, withdrawable balance.
- Withdraw modal is UI-only unless wired to `withdraw.js` + API.
- CSV export uses filename `morphswift-ledger.csv`.

## Onboarding (`onboarding.html`)

- Google and email flows redirect or show “check inbox” (demo).
- Production: call `loginWithEmail()` from `magic.js` then route to `terminal.html`.

## PWA assets

| File | Purpose |
|------|---------|
| `manifest.json` | App name **MorphSwift POS**, theme `#f5a623`, start URL `onboarding.html` |
| `sw.js` | Cache-first shell for HTML/CSS/icons (`morphswift-shell-v1`) |
| `assets/icons/logo.svg`, `favicon.svg` | Brand mark |

Register in HTML `<head>` when enabling installability:

```html
<link rel="manifest" href="manifest.json" />
<link rel="icon" href="assets/icons/favicon.svg" type="image/svg+xml" />
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
</script>
```

## Vendor libraries (`lib/`)

Placeholder files for optional offline bundles:

- `ethers.umd.min.js` — EVM wallet interactions
- `magic.esm.js` — Magic Link SDK
- `qrcode,min.js` — local QR (filename typo; prefer CDN or rename to `qrcode.min.js`)

Checkout currently loads QRCode from cdnjs; download vendors only if you need offline support.

## Next steps (refactor)

1. Replace inline `<style>` with the shared CSS stack.
2. Replace inline `<script>` with module imports per page.
3. Terminal: use `priceFeeds.js` + `POST /api/quotes` instead of hard-coded rates.
4. Checkout: `POST /api/checkouts` + `watchCheckout()` instead of simulation-only flow.
5. Ledger: `fetchLedger(merchantId)` when a session exists.

See [integration.md](../integration.md) for API contracts and end-to-end flows.
