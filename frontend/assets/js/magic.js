/**
 * Merchant auth — API session + local persistence.
 * Wire Magic SDK later via CONFIG.magicPublishableKey when available.
 */

import { apiUrl, CONFIG } from '../../config.js';

export async function createSession({ email, displayName, provider = 'magic-link' }) {
  const res = await fetch(apiUrl('auth/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, displayName, provider }),
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

/**
 * Demo / offline login used by onboarding.html until Magic is configured.
 */
export async function loginWithEmail(email) {
  const displayName = email.split('@')[0];
  return createSession({ email, displayName, provider: 'magic-link' });
}
