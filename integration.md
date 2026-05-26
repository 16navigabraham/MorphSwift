# MorphSwift — Integration guide

How to connect the MorphSwift frontend, API server, on-chain gateway, and external systems.

## Architecture

```mermaid
flowchart LR
  subgraph client [Merchant browser]
    UI[Static POS pages]
    Mod[ES modules config / magic / ledger]
  end
  subgraph api [Express API :4000]
    Auth[/api/auth]
    Config[/api/config]
    Quotes[/api/quotes]
    Checkouts[/api/checkouts]
    Merchants[/api/merchants]
    Withdrawals[/api/withdrawals]
    Webhooks[/api/webhooks]
  end
  subgraph chain [Morph]
    GW[MorphSwiftGateway]
  end
  UI --> Mod
  Mod --> api
  Webhooks --> Checkouts
  GW -.->|payment events| Webhooks
```

## Base URL and CORS

| Environment | Frontend | API |
|-------------|----------|-----|
| Local | `http://localhost:3000` (static serve) | `http://localhost:4000` |
| Production | Your CDN / static host | Reverse-proxy `/api` → server |

`frontend/config.js` sets `apiBaseUrl` to `http://localhost:4000/api` on localhost and `/api` otherwise. Ensure the API enables CORS for your frontend origin (`server/src/app.js` uses `cors()` globally).

## Authentication

Create a merchant session:

```http
POST /api/auth/session
Content-Type: application/json

{
  "email": "merchant@shop.com",
  "displayName": "MG Store",
  "provider": "magic-link"
}
```

**Response `201`:**

```json
{
  "merchant": {
    "id": "mrc_…",
    "email": "merchant@shop.com",
    "displayName": "MG Store",
    "balance": 0,
    "currency": "USDC"
  },
  "sessionToken": "msw_…",
  "onboardingComplete": true
}
```

Frontend helper (`assets/js/magic.js`):

```javascript
import { createSession, saveSession, getMerchantId } from './assets/js/magic.js';

const session = await createSession({
  email: 'merchant@shop.com',
  displayName: 'MG Store',
});
```

Persist `sessionToken` and `merchant` via `saveSession` (uses `localStorage` keys from `config.js`).

## Brand and rate configuration

```http
GET /api/config
```

Returns store settings: `brandName`, `fiatRates`, `tokenRates`, `feeModel`, `supportedCurrencies`, `supportedStablecoins`, `settlementTargetSeconds`.

Use `priceFeeds.js` → `loadPriceSettings()` on the terminal before displaying conversions.

## Quote → checkout flow

### 1. Quote (optional preview)

```http
POST /api/quotes
Content-Type: application/json

{
  "amountFiat": 500,
  "currency": "PHP",
  "token": "USDC"
}
```

Returns `stablecoinAmount`, fees, `quoteId`, and `displayAmount`.

### 2. Create checkout

```http
POST /api/checkouts
Content-Type: application/json

{
  "merchantId": "mrc_…",
  "amountFiat": 500,
  "currency": "PHP",
  "token": "USDC",
  "reference": "pos-terminal-42"
}
```

**Response `201`** includes:

| Field | Description |
|-------|-------------|
| `id` | Checkout ID (`chk_…`) |
| `qrPayload` | Base64url JSON (`morphswift-pos-v1`) for QR encoding |
| `stablecoinAmount` | Amount customer should send |
| `status` | `pending` until confirmed |

Decode QR payload in the browser:

```javascript
import { decodeCheckoutPayload, buildPaymentUri } from './assets/js/qrPayload.js';

const payload = decodeCheckoutPayload(checkout.qrPayload);
const uri = buildPaymentUri({
  address: merchantPayoutWallet,
  amount: checkout.stablecoinAmount,
  token: checkout.token,
  network: 'Morph',
});
```

### 3. Poll or webhook confirm

**Poll:**

```http
GET /api/checkouts/:checkoutId
```

When `status` is `confirmed`, settlement is complete.

```javascript
import { watchCheckout } from './assets/js/chainListener.js';

watchCheckout(checkoutId, {
  onPending: (c) => console.log('waiting', c.status),
  onConfirmed: (c) => showSuccess(c),
  onError: (err) => console.error(err),
});
```

**Manual confirm (demo / operator):**

```http
POST /api/checkouts/:checkoutId/confirm
Content-Type: application/json

{ "txHash": "0x…" }
```

**Webhook (chain indexer / relayer):**

```http
POST /api/webhooks/payment-received
Content-Type: application/json

{
  "checkoutId": "chk_…",
  "txHash": "0x…"
}
```

Returns `event: "payment.received"` plus checkout, transaction, and updated merchant balance.

## Merchant ledger and withdrawals

```http
GET /api/merchants/:merchantId/ledger?limit=50
```

```javascript
import { fetchLedger } from './assets/js/ledger.js';
const { transactions, balance } = await fetchLedger();
```

```http
POST /api/withdrawals
Content-Type: application/json

{
  "merchantId": "mrc_…",
  "amount": 10.5,
  "token": "USDC",
  "destination": "0x…"
}
```

```javascript
import { createWithdrawal } from './assets/js/withdraw.js';
await createWithdrawal({ amount: 10.5, destination: '0x…' });
```

## QR payload protocol

Embedded in `qrPayload` from the API:

```json
{
  "protocol": "morphswift-pos-v1",
  "checkoutId": "chk_…",
  "merchantId": "mrc_…",
  "amountFiat": 500,
  "currency": "PHP",
  "token": "USDC",
  "recipient": "mrc_…",
  "createdAt": "2026-05-26T12:00:00.000Z"
}
```

Encoded as **base64url** (no padding). See `assets/js/qrPayload.js` for encode/decode helpers.

## Smart contract (`contracts/`)

`MorphSwiftGateway.sol` registers merchants, creates checkouts, and settles ERC-20 transfers on Morph. Wire contract events to your indexer, then call `POST /api/webhooks/payment-received` with the matching `checkoutId` and `txHash`.

Deploy and configure treasury, fee bps, and token allowlist per your network deployment checklist.

## Deployment checklist

1. **Server** — set `PORT`, run `npm start`, persist `server/data/store.json` (or replace with a real database).
2. **Static frontend** — deploy `frontend/` to CDN; set `config.js` `apiBaseUrl` if not using `/api` proxy.
3. **HTTPS** — required for service workers and secure cookies in production.
4. **Magic Link** — set `CONFIG.magicPublishableKey` when replacing demo onboarding auth.
5. **Webhooks** — protect `/api/webhooks/*` with shared secrets or network ACLs in production.

## Error handling

API errors return JSON `{ "message": "…" }` with appropriate HTTP status (400, 404, 500). Frontend modules throw `Error` with the message from the response body.

## Related docs

- [README.md](README.md) — project overview and quick start
- [frontend/implementation.md](frontend/implementation.md) — UI structure and modules
