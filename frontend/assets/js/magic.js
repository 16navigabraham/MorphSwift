import { apiUrl, CONFIG } from '../../config.js';

export async function createSession({ walletAddress, displayName, provider = 'wallet-connect' }) {
  const res = await fetch(apiUrl('auth/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, displayName, provider }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Auth failed (${res.status})`);
  }

  const session = await res.json();
  saveSession(session);
  return session;
}

export function saveSession(session) {
  if (session?.sessionToken) {
    localStorage.setItem(CONFIG.storage.sessionToken, session.sessionToken);
  }
  if (session?.merchant) {
    localStorage.setItem(CONFIG.storage.merchant, JSON.stringify(session.merchant));
  }
}

export function getSession() {
  const token = localStorage.getItem(CONFIG.storage.sessionToken);
  const merchantRaw = localStorage.getItem(CONFIG.storage.merchant);
  let merchant = null;
  if (merchantRaw) {
    try {
      merchant = JSON.parse(merchantRaw);
    } catch {
      merchant = null;
    }
  }
  return { sessionToken: token, merchant };
}

export function clearSession() {
  localStorage.removeItem(CONFIG.storage.sessionToken);
  localStorage.removeItem(CONFIG.storage.merchant);
}

export function getMerchantId() {
  return getSession().merchant?.id ?? null;
}

export async function loginWithWallet(walletAddress) {
  const short = String(walletAddress || '').slice(0, 8);
  return createSession({ walletAddress, displayName: short, provider: 'wallet-connect' });
}

