# MorphSwift

MorphSwift is a mobile-first crypto point-of-sale stack for merchants: a static POS frontend, an Express API, and an on-chain gateway contract for stablecoin checkouts on Morph.

## Repository layout

| Path | Purpose |
|------|---------|
| `frontend/` | Merchant POS UI (terminal, checkout, ledger, onboarding) |
| `server/` | REST API, JSON store, quote/checkout/withdrawal flows |
| `contracts/` | `MorphSwiftGateway` Solidity contract |

## Documentation

- [Frontend implementation](frontend/implementation.md) — pages, modules, styling, and PWA behavior
- [Integration guide](integration.md) — API, auth, checkout lifecycle, webhooks, and deployment wiring

## Quick start

### API server

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

The API listens on `http://localhost:4000` by default. Health check: `GET http://localhost:4000/health`.

### Frontend

Serve the `frontend/` directory with any static file server, for example:

```bash
npx serve frontend -p 3000
```

Open `http://localhost:3000/onboarding.html`. In development, `frontend/config.js` points API calls at `http://localhost:4000/api`.

### Typical flow

1. **Onboarding** — merchant signs in (demo UI or `POST /api/auth/session`).
2. **Terminal** — enter a fiat amount and start a charge.
3. **Checkout** — customer scans a QR code; payment is confirmed via polling or webhook.
4. **Ledger** — view balance, history, and withdrawals.

## Supported assets (demo / API)

- **Fiat:** USD, PHP, SGD, MYR, IDR, THB, VND (and NGN in the terminal demo UI)
- **Stablecoins:** USDC, USDT
- **Settlement target:** Morph network (configurable in store settings)

## License

See [LICENSE](LICENSE).
